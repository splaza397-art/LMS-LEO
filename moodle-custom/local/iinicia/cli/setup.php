<?php
// Configuracion idempotente: SSO, web services, cuenta de servicio de minimo privilegio y tema.
define('CLI_SCRIPT', true);
require(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->libdir . '/accesslib.php');

use core\oauth2\endpoint;
use core\oauth2\issuer;
use core\oauth2\user_field_mapping;

\core\session\manager::set_user(get_admin());

// 1. Sitio y autenticacion: las cuentas solo se crean desde el backend.
set_config('enablewebservices', 1);
set_config('webserviceprotocols', 'rest');
set_config('auth', 'oauth2');
set_config('registerauth', '');
set_config('authpreventaccountcreation', 1);
set_config('enablecompletion', 1);
set_config('theme', 'iinicia');
set_config('lang', 'es');
set_config('timezone', 'America/Mexico_City');
set_config('forcetimezone', 'America/Mexico_City');
set_config('forcelogin', 1);
// Nadie entra con usuario y contrasena de Moodle: solo con la cuenta IINICIA. Se oculta el formulario manual.
// Recuperacion de emergencia del administrador local: php admin/cli/cfg.php --name=showloginform --set=1
set_config('showloginform', 0);
// Panel izquierdo de la pantalla de acceso (sustituye la bienvenida generica de Moodle).
set_config('auth_instructions', '<h2>Campus IINICIA</h2>'
    . '<p>Entra con la misma cuenta que usas en el portal y en la app.</p>'
    . '<p>¿Aún no tienes cuenta? Créala en el portal IINICIA.</p>');
\core\plugin_manager::reset_caches();

// 2. Proveedor de identidad OIDC.
$public = rtrim(getenv('KEYCLOAK_PUBLIC_URL'), '/') . '/realms/iinicia/protocol/openid-connect';
$internal = rtrim(getenv('KEYCLOAK_INTERNAL_URL'), '/') . '/realms/iinicia/protocol/openid-connect';
$issuer = issuer::get_record(['name' => 'IINICIA']);
$values = [
    'name' => 'IINICIA',
    'image' => '',
    'clientid' => 'iinicia-moodle',
    'clientsecret' => getenv('MOODLE_OIDC_CLIENT_SECRET'),
    'baseurl' => '',
    'enabled' => 1,
    'showonloginpage' => issuer::EVERYWHERE,
    'basicauth' => 0,
    'loginscopes' => 'openid profile email',
    'loginscopesoffline' => 'openid profile email',
    // Fase 4.10: entrar a Moodle directamente (marcador, historial) siempre pide credenciales en Keycloak. La entrada
    // normal desde IINICIA usa comprobantes firmados; así, una sesión de Keycloak que haya quedado en el navegador
    // (por ejemplo, si Keycloak no respondía al cerrar sesión) no abre Moodle con la cuenta anterior.
    'loginparams' => 'prompt=login',
    'requireconfirmation' => 1,
    'loginpagename' => 'tu cuenta IINICIA',
];
if ($issuer) {
    foreach ($values as $k => $v) {
        $issuer->set($k, $v);
    }
    $issuer->update();
} else {
    $issuer = new issuer(0, (object) $values);
    $issuer->create();
}
foreach ([
    'authorization_endpoint' => "$public/auth",
    'token_endpoint' => "$internal/token",
    'userinfo_endpoint' => "$internal/userinfo",
] as $name => $url) {
    $endpoint = endpoint::get_record(['issuerid' => $issuer->get('id'), 'name' => $name]);
    if (getenv('MOODLE_ALLOW_PRIVATE_HOSTS') === 'true') {
        // Solo DEV: la validacion de Moodle exige https y el entorno local usa http.
        $now = time();
        if ($endpoint) {
            $DB->set_field('oauth2_endpoint', 'url', $url, ['id' => $endpoint->get('id')]);
        } else {
            $DB->insert_record('oauth2_endpoint', (object) [
                'issuerid' => $issuer->get('id'), 'name' => $name, 'url' => $url,
                'timecreated' => $now, 'timemodified' => $now, 'usermodified' => $USER->id,
            ]);
        }
    } else if ($endpoint) {
        $endpoint->set('url', $url);
        $endpoint->update();
    } else {
        (new endpoint(0, (object) ['issuerid' => $issuer->get('id'), 'name' => $name, 'url' => $url]))->create();
    }
}
foreach (['sub' => 'username', 'email' => 'email', 'given_name' => 'firstname', 'family_name' => 'lastname'] as $ext => $int) {
    if (!user_field_mapping::get_record(['issuerid' => $issuer->get('id'), 'internalfield' => $int])) {
        (new user_field_mapping(0, (object) [
            'issuerid' => $issuer->get('id'), 'externalfield' => $ext, 'internalfield' => $int,
        ]))->create();
    }
}
set_config('issuerid', $issuer->get('id'), 'local_iinicia');

// Secreto compartido con el backend para firmar los comprobantes de entrada al campus (Fase 4.10).
$ssosecret = (string) getenv('MOODLE_SSO_SECRET');
if (strlen($ssosecret) < 32) {
    cli_error('[iinicia] Falta MOODLE_SSO_SECRET (al menos 32 caracteres).');
}
set_config('ssosecret', $ssosecret, 'local_iinicia');

// 3. Cuenta y rol de servicio con solo las capacidades necesarias.
$system = context_system::instance();
$svc = $DB->get_record('user', ['username' => 'iinicia_ws', 'deleted' => 0]);
if (!$svc) {
    $id = user_create_user((object) [
        'auth' => 'webservice',
        'confirmed' => 1,
        'mnethostid' => $CFG->mnet_localhost_id,
        'username' => 'iinicia_ws',
        'password' => AUTH_PASSWORD_NOT_CACHED,
        'firstname' => 'Servicio',
        'lastname' => 'IINICIA',
        'email' => 'servicio@iinicia.local',
    ], false, false);
    $svc = $DB->get_record('user', ['id' => $id], '*', MUST_EXIST);
}
set_config('auth', 'oauth2,webservice');
$roleid = $DB->get_field('role', 'id', ['shortname' => 'iinicia_service']);
if (!$roleid) {
    $roleid = create_role('IINICIA Service', 'iinicia_service', 'Cuenta de integracion del backend IINICIA');
    set_role_contextlevels($roleid, [CONTEXT_SYSTEM]);
}
foreach ([
    'local/iinicia:syncidentity',
    'webservice/rest:use',
    'moodle/course:view',
    'moodle/course:viewhiddencourses',
    'moodle/course:viewhiddenactivities',
    'moodle/user:viewdetails',
] as $cap) {
    assign_capability($cap, CAP_ALLOW, $roleid, $system->id, true);
}
role_assign($roleid, $svc->id, $system->id);

// 4. Servicio externo y token fijo definido en el entorno.
$service = $DB->get_record('external_services', ['shortname' => 'iinicia_backend'], '*', MUST_EXIST);
if (!$DB->record_exists('external_services_users', ['externalserviceid' => $service->id, 'userid' => $svc->id])) {
    $DB->insert_record('external_services_users', (object) [
        'externalserviceid' => $service->id, 'userid' => $svc->id, 'timecreated' => time(),
    ]);
}
$DB->delete_records_select('external_tokens', 'externalserviceid = ? AND userid = ?', [$service->id, $svc->id]);
$DB->insert_record('external_tokens', (object) [
    'token' => getenv('MOODLE_WS_TOKEN'),
    'privatetoken' => random_string(64),
    'tokentype' => EXTERNAL_TOKEN_PERMANENT,
    'userid' => $svc->id,
    'externalserviceid' => $service->id,
    'contextid' => $system->id,
    'creatorid' => get_admin()->id,
    'name' => 'IINICIA Backend',
    'timecreated' => time(),
    'validuntil' => 0,
]);

// 5. Logotipo IINICIA en la barra (compacto, blanco) y en paginas con fondo claro (completo, oscuro).
$fs = get_file_storage();
foreach (['logocompact' => 'logo-compacto.png', 'logo' => 'logo.png'] as $setting => $file) {
    $source = $CFG->dirroot . '/theme/iinicia/pix/' . $file;
    $fs->delete_area_files($system->id, 'core_admin', $setting, 0);
    $fs->create_file_from_pathname([
        'contextid' => $system->id, 'component' => 'core_admin', 'filearea' => $setting,
        'itemid' => 0, 'filepath' => '/', 'filename' => $file,
    ], $source);
    set_config($setting, '/' . $file, 'core_admin');
}
theme_reset_all_caches();

accesslib_clear_all_caches(true);
cli_writeln('[iinicia] Configuracion aplicada. issuer=' . $issuer->get('id'));
