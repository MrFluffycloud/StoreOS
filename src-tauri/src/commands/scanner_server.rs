use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Mutex, OnceLock};
use std::thread;
use tauri::Emitter;

fn approved_ips() -> &'static Mutex<HashSet<String>> {
    static APPROVED_IPS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    APPROVED_IPS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn pending_requests() -> &'static Mutex<HashMap<String, String>> {
    static PENDING_REQUESTS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    PENDING_REQUESTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn catalog_json() -> &'static Mutex<String> {
    static CATALOG_JSON: OnceLock<Mutex<String>> = OnceLock::new();
    CATALOG_JSON.get_or_init(|| Mutex::new("[]".to_string()))
}

#[tauri::command]
pub fn get_local_ip() -> String {
    use std::process::Command;
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("cmd").args(&["/C", "ipconfig"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut ips = Vec::new();
            for line in stdout.lines() {
                if line.contains("IPv4 Address") {
                    if let Some(pos) = line.find(':') {
                        let ip = line[pos + 1..].trim();
                        if !ip.is_empty() && ip != "127.0.0.1" {
                            ips.push(ip.to_string());
                        }
                    }
                }
            }
            if !ips.is_empty() {
                return ips.join(",");
            }
        }
    }

    match std::net::UdpSocket::bind("0.0.0.0:0") {
        Ok(socket) => {
            if socket.connect("8.8.8.8:80").is_ok() {
                if let Ok(local_addr) = socket.local_addr() {
                    return local_addr.ip().to_string();
                }
            }
            "192.168.137.1".to_string()
        }
        Err(_) => "192.168.137.1".to_string(),
    }
}

#[tauri::command]
pub fn approve_device(ip: String, approve: bool, products_json: String) {
    if approve {
        if let Ok(mut pending) = pending_requests().lock() {
            pending.remove(&ip);
        }
        if let Ok(mut approved) = approved_ips().lock() {
            approved.insert(ip);
        }
        if let Ok(mut catalog) = catalog_json().lock() {
            *catalog = products_json;
        }
    } else {
        if let Ok(mut pending) = pending_requests().lock() {
            pending.remove(&ip);
        }
        if let Ok(mut approved) = approved_ips().lock() {
            approved.remove(&ip);
        }
    }
}

#[tauri::command]
pub fn disconnect_device(ip: String) {
    if let Ok(mut approved) = approved_ips().lock() {
        approved.remove(&ip);
    }
}

pub fn start_scanner_server(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind("0.0.0.0:3030") {
            Ok(l) => l,
            Err(e) => {
                eprintln!("Failed to bind scanner server to port 3030: {}", e);
                return;
            }
        };

        println!("StoreOS pairing scanner server running on http://localhost:3030");

        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let app_clone = app_handle.clone();
                thread::spawn(move || {
                    let mut buffer = [0; 4096];
                    if let Ok(size) = stream.read(&mut buffer) {
                        let request = String::from_utf8_lossy(&buffer[..size]);
                        let client_ip = match stream.peer_addr() {
                            Ok(addr) => addr.ip().to_string(),
                            Err(_) => "127.0.0.1".to_string(),
                        };

                        if request.starts_with("POST /api/scan") {
                            let is_approved = if let Ok(approved) = approved_ips().lock() {
                                approved.contains(&client_ip)
                            } else {
                                false
                            };

                            if !is_approved {
                                let response = "HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"unauthorized\"}";
                                let _ = stream.write_all(response.as_bytes());
                                return;
                            }

                            // Parse barcode body
                            if let Some(body_start) = request.find("\r\n\r\n") {
                                let body = &request[body_start + 4..];
                                let barcode = if let Some(start) = body.find("\"barcode\":\"") {
                                    let end = &body[start + 11..];
                                    if let Some(end_pos) = end.find("\"") {
                                        end[..end_pos].to_string()
                                    } else {
                                        "".to_string()
                                    }
                                } else {
                                    "".to_string()
                                };

                                let qty = if let Some(start) = body.find("\"qty\":") {
                                    let end = &body[start + 6..];
                                    let mut digit_end = 0;
                                    for c in end.chars() {
                                        if c.is_ascii_digit() {
                                            digit_end += 1;
                                        } else {
                                            break;
                                        }
                                    }
                                    if digit_end > 0 {
                                        end[..digit_end].parse::<i32>().unwrap_or(1)
                                    } else {
                                        1
                                    }
                                } else {
                                    1
                                };

                                if !barcode.is_empty() {
                                    let payload = serde_json::json!({
                                      "barcode": barcode,
                                      "qty": qty
                                    })
                                    .to_string();
                                    let _ = app_clone.emit("mobile-scan", payload);
                                }
                            }

                            let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"success\":true}";
                            let _ = stream.write_all(response.as_bytes());
                        } else if request.starts_with("GET /api/connect") {
                            // Get PIN parameter from URL query string
                            let pin = if let Some(pin_start) = request.find("pin=") {
                                let end = &request[pin_start + 4..];
                                let space_pos = end.find(' ').unwrap_or(end.len());
                                let amp_pos = end.find('&').unwrap_or(space_pos);
                                let end_pos = std::cmp::min(space_pos, amp_pos);
                                end[..end_pos].to_string()
                            } else {
                                "".to_string()
                            };

                            if !pin.is_empty() {
                                if let Ok(mut pending) = pending_requests().lock() {
                                    pending.insert(client_ip.clone(), pin.clone());
                                }
                                let _ = app_clone.emit(
                                    "mobile-connect-request",
                                    serde_json::json!({
                                      "ip": client_ip,
                                      "pin": pin
                                    })
                                    .to_string(),
                                );
                            }

                            let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"status\":\"pending\"}";
                            let _ = stream.write_all(response.as_bytes());
                        } else if request.starts_with("GET /api/status") {
                            let is_approved = if let Ok(approved) = approved_ips().lock() {
                                approved.contains(&client_ip)
                            } else {
                                false
                            };

                            let status_str = if is_approved { "approved" } else { "pending" };
                            let catalog = if is_approved {
                                if let Ok(cat) = catalog_json().lock() {
                                    cat.clone()
                                } else {
                                    "[]".to_string()
                                }
                            } else {
                                "[]".to_string()
                            };

                            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{{\"status\":\"{}\",\"products\":{}}}",
                status_str,
                catalog
              );
                            let _ = stream.write_all(response.as_bytes());
                        } else if request.starts_with("GET /manifest.json") {
                            let manifest = r##"{
  "name": "StoreOS Mobile Scanner",
  "short_name": "StoreOS Scan",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0f19",
  "theme_color": "#10b981",
  "orientation": "portrait",
  "icons": [
    {
      "src": "https://img.icons8.com/color/192/barcode-scanner.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "https://img.icons8.com/color/512/barcode-scanner.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}"##;
                            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                manifest.len(),
                manifest
              );
                            let _ = stream.write_all(response.as_bytes());
                        } else if request.starts_with("GET /sw.js") {
                            let sw = r##"const CACHE_NAME = "storeos-scanner-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        "/",
        "https://unpkg.com/html5-qrcode",
        "https://img.icons8.com/color/512/barcode-scanner.png"
      ]);
    })
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request);
    })
  );
});"##;
                            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/javascript\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                sw.len(),
                sw
              );
                            let _ = stream.write_all(response.as_bytes());
                        } else if request.starts_with("GET /") {
                            // Serve HTML page
                            let html = include_str!("mobile_scanner.html");
                            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(),
                html
              );
                            let _ = stream.write_all(response.as_bytes());
                        }
                    }
                });
            }
        }
    });
}

#[tauri::command]
pub fn print_receipt_silent(printer_name: String, html_content: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write as IoWrite;
    use std::process::Command;

    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join("storeos_receipt.html");

    // Write HTML content to temp file
    let mut file = File::create(&file_path).map_err(|e| e.to_string())?;
    file.write_all(html_content.as_bytes())
        .map_err(|e| e.to_string())?;

    let file_path_str = file_path.to_string_lossy().to_string();

    // Execute Edge silent print using powershell Start-Process
    let output = Command::new("powershell")
    .args(&[
      "-NoProfile",
      "-Command",
      &format!(
        "Start-Process -FilePath 'msedge.exe' -ArgumentList '--headless', '--disable-gpu', '--print-to-printer', '--printer-name=\"{}\"', '\"{}\"' -WindowStyle Hidden",
        printer_name,
        file_path_str
      )
    ])
    .output();

    match output {
        Ok(_) => {
            // Small thread spawn to cleanup temp file after printing has queued
            thread::spawn(move || {
                thread::sleep(std::time::Duration::from_secs(5));
                let _ = std::fs::remove_file(file_path);
            });
            Ok("Print job queued successfully".to_string())
        }
        Err(e) => Err(format!("Failed to execute Edge print: {}", e)),
    }
}

#[repr(C)]
#[allow(non_snake_case)]
struct DOC_INFO_1_W {
    pDocName: *const u16,
    pOutputFile: *const u16,
    pDatatype: *const u16,
}

#[link(name = "winspool")]
extern "system" {
    fn OpenPrinterW(
        pPrinterName: *const u16,
        phPrinter: *mut usize,
        pDefault: *const std::ffi::c_void,
    ) -> i32;
    fn StartDocPrinterW(hPrinter: usize, level: u32, pDocInfo: *const DOC_INFO_1_W) -> u32;
    fn StartPagePrinter(hPrinter: usize) -> i32;
    fn WritePrinter(hPrinter: usize, pBuf: *const u8, cbBuf: u32, pcWritten: *mut u32) -> i32;
    fn EndPagePrinter(hPrinter: usize) -> i32;
    fn EndDocPrinter(hPrinter: usize) -> i32;
    fn ClosePrinter(hPrinter: usize) -> i32;
}

#[tauri::command]
pub fn print_receipt_raw(printer_name: String, text_content: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide_printer: Vec<u16> = OsStr::new(&printer_name)
            .encode_wide()
            .chain(Some(0))
            .collect();
        let doc_name: Vec<u16> = OsStr::new("StoreOS Receipt")
            .encode_wide()
            .chain(Some(0))
            .collect();
        let datatype: Vec<u16> = OsStr::new("RAW").encode_wide().chain(Some(0)).collect();

        let mut h_printer: usize = 0;
        unsafe {
            if OpenPrinterW(wide_printer.as_ptr(), &mut h_printer, std::ptr::null()) == 0 {
                return Err("Failed to open printer adapter.".to_string());
            }

            let doc_info = DOC_INFO_1_W {
                pDocName: doc_name.as_ptr(),
                pOutputFile: std::ptr::null(),
                pDatatype: datatype.as_ptr(),
            };

            let doc_id = StartDocPrinterW(h_printer, 1, &doc_info);
            if doc_id == 0 {
                ClosePrinter(h_printer);
                return Err("Failed to initiate print document spooler.".to_string());
            }

            if StartPagePrinter(h_printer) == 0 {
                EndDocPrinter(h_printer);
                ClosePrinter(h_printer);
                return Err("Failed to start print page.".to_string());
            }

            let bytes = text_content.as_bytes();
            let mut written: u32 = 0;
            let write_res =
                WritePrinter(h_printer, bytes.as_ptr(), bytes.len() as u32, &mut written);

            EndPagePrinter(h_printer);
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);

            if write_res == 0 {
                return Err("Failed to write data bytes to printer spooler.".to_string());
            }
        }
        Ok("Print job spooled successfully".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("Raw print to {}: \n{}", printer_name, text_content);
        Ok("Print simulated".to_string())
    }
}

#[tauri::command]
pub fn save_receipt_pdf(html_content: String, filename: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write as IoWrite;
    use std::process::Command;

    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join("storeos_receipt.html");

    // Write HTML to temp file
    let mut file = File::create(&file_path).map_err(|e| e.to_string())?;
    file.write_all(html_content.as_bytes())
        .map_err(|e| e.to_string())?;

    // Find Desktop folder path on Windows
    let home_dir = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:".to_string());
    let desktop_path = std::path::Path::new(&home_dir).join("Desktop");
    let pdf_path = desktop_path.join(format!("{}.pdf", filename));

    let file_path_str = file_path.to_string_lossy().to_string();
    let pdf_path_str = pdf_path.to_string_lossy().to_string();

    // Print to PDF using Edge silently
    let output = Command::new("powershell")
    .args(&[
      "-NoProfile",
      "-Command",
      &format!(
        "Start-Process -FilePath 'msedge.exe' -ArgumentList '--headless', '--disable-gpu', '--print-to-pdf=\"{}\"', '\"{}\"' -WindowStyle Hidden -Wait",
        pdf_path_str,
        file_path_str
      )
    ])
    .output();

    match output {
        Ok(_) => {
            // Open the generated PDF automatically so they can see/print it
            let _ = Command::new("powershell")
                .args(&[
                    "-NoProfile",
                    "-Command",
                    &format!("Start-Process -FilePath '{}'", pdf_path_str),
                ])
                .output();

            let _ = std::fs::remove_file(file_path);
            Ok(pdf_path_str)
        }
        Err(e) => Err(format!("Failed to generate PDF: {}", e)),
    }
}
