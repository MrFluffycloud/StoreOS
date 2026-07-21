const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Helper to run shell commands and print output
function runCmd(cmd) {
	console.log(`> ${cmd}`);
	try {
		return execSync(cmd, { stdio: 'inherit' });
	} catch (error) {
		console.error(`Command failed: ${cmd}`);
		process.exit(1);
	}
}

// 1. Get current version from package.json
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

console.log(`Current version: v${currentVersion}`);

// 2. Determine new version
let newVersion = process.argv[2];
if (!newVersion) {
	// Auto-increment patch version (e.g. 0.1.0 -> 0.1.1)
	const parts = currentVersion.split('.');
	if (parts.length === 3) {
		parts[2] = parseInt(parts[2], 10) + 1;
		newVersion = parts.join('.');
	} else {
		console.error(
			'Could not parse current version for auto-increment. Please specify the new version as an argument.',
		);
		process.exit(1);
	}
}

// Validate version format
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
	console.error(`Invalid version format: "${newVersion}". Must match x.y.z`);
	process.exit(1);
}

console.log(`Bumping version to: v${newVersion}`);

// 3. Update package.json
console.log('Updating package.json...');
let packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
packageJsonContent = packageJsonContent.replace(
	/("version"\s*:\s*")[^"]+(")/,
	`$1${newVersion}$2`,
);
fs.writeFileSync(packageJsonPath, packageJsonContent, 'utf8');

// 4. Update tauri.conf.json
const tauriConfPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
	console.log('Updating tauri.conf.json...');
	let tauriConfContent = fs.readFileSync(tauriConfPath, 'utf8');
	tauriConfContent = tauriConfContent.replace(
		/("version"\s*:\s*")[^"]+(")/,
		`$1${newVersion}$2`,
	);
	fs.writeFileSync(tauriConfPath, tauriConfContent, 'utf8');
} else {
	console.warn('tauri.conf.json not found!');
}

// 5. Update src-tauri/Cargo.toml
const cargoTomlPath = path.join(__dirname, '../src-tauri/Cargo.toml');
if (fs.existsSync(cargoTomlPath)) {
	console.log('Updating Cargo.toml...');
	let cargoTomlContent = fs.readFileSync(cargoTomlPath, 'utf8');
	cargoTomlContent = cargoTomlContent.replace(
		/^(version\s*=\s*")[^"]+(")/m,
		`$1${newVersion}$2`,
	);
	fs.writeFileSync(cargoTomlPath, cargoTomlContent, 'utf8');
} else {
	console.warn('Cargo.toml not found!');
}

// 6. Generate Release Notes / Changelog
console.log('\nGenerating Release Notes & Changelog...');
let changelog = process.argv[3];

if (!changelog) {
	try {
		const lastTag = execSync('git describe --tags --abbrev=0', {
			encoding: 'utf8',
		}).trim();
		if (lastTag) {
			const logs = execSync(`git log ${lastTag}..HEAD --oneline`, {
				encoding: 'utf8',
			}).trim();
			if (logs) {
				const lines = logs
					.split('\n')
					.map((line) => line.replace(/^[a-f0-9]+\s+/, ''))
					.filter((msg) => !msg.toLowerCase().includes('bump version'))
					.map((msg) => `- ${msg}`);
				if (lines.length > 0) {
					changelog = `Release v${newVersion} Changes:\n\n` + lines.join('\n');
				}
			}
		}
	} catch (err) {
		// If no previous tag found
	}
}

if (!changelog) {
	changelog = `Release v${newVersion}:\n- Modern bklit charts integration\n- Chart readability & spacing improvements\n- DataTable numeric sorting fix\n- Query performance & caching optimizations`;
}

console.log('\n--- Release Notes Body ---');
console.log(changelog);
console.log('-------------------------\n');

// 7. Git commit, tag, and push
console.log('Starting Git release process...');
const commitMsg = `bump version to v${newVersion}\n\n${changelog}`;
const msgPath = path.join(__dirname, '../.git_release_msg.txt');
fs.writeFileSync(msgPath, commitMsg, 'utf8');

runCmd('git add -A');
runCmd(`git commit -F "${msgPath}"`);

if (fs.existsSync(msgPath)) {
	fs.unlinkSync(msgPath);
}

runCmd(`git tag -a v${newVersion} -m "StoreOS v${newVersion}"`);
runCmd('git push origin main --tags');

console.log(
	`\nSuccess! Version bumped to v${newVersion} and tag pushed to GitHub.`,
);
console.log('GitHub Actions workflow has been triggered with rich changelogs.');
