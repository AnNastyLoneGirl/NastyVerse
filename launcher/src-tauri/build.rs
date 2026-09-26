fn main() {
    println!("cargo:rerun-if-env-changed=NASTYVERSE_UPDATER_PUBLIC_KEY");
    // The launcher UI is bundled into the only native executable. Keep its
    // design tokens synchronized from the shared source of truth at build time.
    let shared = "../../shared/tokens.css";
    let dest = "../src/tokens.css";
    if let Err(error) = std::fs::copy(shared, dest) {
        println!("cargo:warning=could not copy {shared} -> {dest}: {error}");
    }

    tauri_build::build()
}
