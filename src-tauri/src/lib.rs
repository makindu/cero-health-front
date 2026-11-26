
use tauri::{
    menu::{
        MenuBuilder,
        MenuItemBuilder,
        PredefinedMenuItem,
        SubmenuBuilder,
    },
    Emitter,
    Manager,
};

use tauri_plugin_window_state::{Builder, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
        .plugin(
            Builder::default()
                .with_denylist(&["splashscreen"])
                .with_state_flags(
                    StateFlags::SIZE
                        | StateFlags::POSITION
                        | StateFlags::MAXIMIZED
                        | StateFlags::DECORATIONS
                        | StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ==========================================
            // 1. MENU FICHIER
            // ==========================================

            let file_menu = SubmenuBuilder::new(app, "Fichier")
                .text("reload_app", "Actualiser l'application")
                .separator()
                .text("minimize", "Réduire la fenêtre")
                .separator()
                .text("quit", "Quitter CERO HEALTH")
                .build()?;

            // ==========================================
            // 2. MENU AFFICHAGE
            // ==========================================

            let view_menu = SubmenuBuilder::new(app, "Affichage")
                .text("toggle_maximize", "Maximiser / Restaurer")
                .text("toggle_fullscreen", "Plein écran")
                .build()?;

            // ==========================================
            // 3. MENU OUTILS
            // ==========================================

            let devtools = MenuItemBuilder::with_id(
                "devtools",
                "Console développeur",
            )
            .enabled(cfg!(debug_assertions))
            .build(app)?;

            let tools_menu = SubmenuBuilder::new(app, "Outils")
                .text("reload_tools", "Recharger l'application")
                .item(&devtools)
                .build()?;

            // ==========================================
            // 4. MENU AIDE
            // ==========================================

            let about_item = PredefinedMenuItem::about(
                app,
                Some("À propos de CERO HEALTH"),
                None,
            )?;

           let help_menu = SubmenuBuilder::new(app, "Aide")
    .text("open_help", "Centre d'aide")
    .separator()
    .item(&about_item)
    .build()?;

            // ==========================================
            // 5. CONSTRUCTION DU MENU PRINCIPAL
            // ==========================================

            let menu = MenuBuilder::new(app)
                .items(&[
                    &file_menu,
                    &view_menu,
                    &tools_menu,
                    &help_menu,
                ])
                .build()?;

            // Le menu est attaché uniquement à la fenêtre principale.
            // Le Splash Screen reste sans menu.
            let main_window = app
                .get_webview_window("main")
                .expect("Fenêtre principale CERO HEALTH introuvable");

            main_window.set_menu(menu)?;

            // ==========================================
            // 6. GESTION DES ACTIONS
            // ==========================================

            let app_handle = app.handle().clone();

            main_window.on_menu_event(move |_window, event| {
                let Some(window) = app_handle.get_webview_window("main") else {
                    return;
                };

                match event.id().as_ref() {
                    "quit" => {
                        app_handle.exit(0);
                    }

                    "minimize" => {
                        let _ = window.minimize();
                    }

                    "toggle_maximize" => {
                        if window.is_maximized().unwrap_or(false) {
                            let _ = window.unmaximize();
                        } else {
                            let _ = window.maximize();
                        }
                    }

                    "toggle_fullscreen" => {
                        let fullscreen =
                            window.is_fullscreen().unwrap_or(false);

                        let _ = window.set_fullscreen(!fullscreen);
                    }

                    "reload_app" | "reload_tools" => {
                        let _ = window.reload();
                    }

                    "devtools" => {
                        if cfg!(debug_assertions) {
                            window.open_devtools();
                        }
                    }

                    "open_help" => {
    let _ = window.emit("cero://open-help", ());
}
                    _ => {}
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
