# 06 · App Android

## Arquitectura

| Capa | Implementación |
|---|---|
| UI | Jetpack Compose, Material 3, navegación con tipos y barra inferior (Inicio, Cursos, Avisos, Perfil) y detalle de curso (`navigation/`) |
| Estado | Un ViewModel por pantalla en `features/*` con `StateFlow` de estado inmutable, en un `ViewModelStore` por sesión |
| Datos | `ApiClient` (OkHttp, solo backend IINICIA, errores clasificados en `AppError`), `IiniciaApi` y repositorios por área con caché cifrada, con dueño y caducidad de 7 días |
| Sesión | `AuthManager` (AppAuth, código y PKCE, `offline_access`) y `SecureStore` (AES-GCM con llave no exportable en Android Keystore) |
| Notificaciones | `NoticeWorker` (WorkManager, cada 15 min con red). Las que enlazan a `/mi-iinicia/cursos/{id}` abren ese curso |
| Enlaces profundos | `iinicia://curso/{id}`, `iinicia://notificaciones` |

La app nunca recibe ni guarda contraseñas ni tokens de Moodle. Los respaldos de Android están desactivados para los datos de sesión.

## Compilar y probar

```bash
cd android
./gradlew assembleDebug                          # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:4000 tcp:4000 && adb reverse tcp:8180 tcp:8180 && adb reverse tcp:8081 tcp:8081
```

Desde Android Studio basta con abrir la carpeta `android` y pulsar Run. El build `debug` usa `http://localhost` mediante `adb reverse`, con texto plano permitido solo hacia `localhost`.

Requisitos: SDK mínimo 26 (Android 8.0), compilación con SDK 37 y destino SDK 36.

## Configuración de producción

`android/gradle.properties` define `iinicia.api.url` e `iinicia.issuer.url`, que hoy apuntan a los provisionales `https://api.iinicia.org/api/v1` y `https://auth.iinicia.org/realms/iinicia`. El build `release` solo acepta HTTPS y activa la minificación.

## Publicación en Google Play (pendiente)

1. Crear la llave de firma (`keytool -genkeypair`) y guardarla fuera del repositorio.
2. Configurar `signingConfigs` con variables de entorno.
3. `./gradlew bundleRelease` para generar el AAB.
4. Ficha de Play, aviso de privacidad y declaración de seguridad de datos.

## Notificaciones push en tiempo real (pendiente)

Requieren un proyecto Firebase y `google-services.json`. El backend ya guarda los dispositivos (`POST /me/devices`). Falta enviar a FCM en `NotificationsService.create()` y registrar el token en la app.

## Verificado

Fase 4 (refactorización MVVM): 56 pruebas unitarias y 12 de interfaz en el emulador, y recorrido manual en el emulador con los servicios de DEV. **Sin probar en el teléfono físico.** Detalle en el [documento 15](15-refactorizacion-android.md).

Antes de la Fase 4:

En el teléfono físico del usuario, con la versión anterior a la sesión larga y al logotipo: inicio de sesión con la misma cuenta del portal, curso autorizado, entrada al campus sin segunda contraseña, avisos, perfil y cierre de sesión. La versión actual compila y está pendiente de prueba en el teléfono.
