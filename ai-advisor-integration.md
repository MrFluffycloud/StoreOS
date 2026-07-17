# AI Advisor Integration Plan

Goal: Incorporate Google Gemini AI into StoreOS to help users learn to improve their business.

## Tasks

- [ ] Task 1: Create Tauri command `call_gemini` in Rust backend → Verify: compiles without error.
- [ ] Task 2: Register Tauri command in `mod.rs` and `lib.rs` → Verify: command is visible to frontend.
- [ ] Task 3: Expose `callGemini` IPC in `src/lib/ipc.ts` → Verify: types align and build passes.
- [ ] Task 4: Add Settings tab for AI configuration → Verify: user can input/save API key and model selection.
- [ ] Task 5: Add AI Advisor tab to sidebar and route in `app-layout.tsx` → Verify: tab is visible and accessible.
- [ ] Task 6: Implement AI Advisor Page (`src/app/ai-advisor/page.tsx`) with Insights and Chat panels → Verify: UI renders.
- [ ] Task 7: Build database context compiler on frontend → Verify: context JSON is correctly serialized.
- [ ] Task 8: Test end-to-end flow with a mockup or actual key → Verify: AI Insights are generated and displayed, Chat functions.

## Done When
- StoreOS builds and runs successfully.
- AI Settings is fully functional (saving API key and model).
- AI Advisor tab displays periodic strategic insights on margin, pricing, stock levels on-demand.
- Interactive AI chat functions with full business context.
