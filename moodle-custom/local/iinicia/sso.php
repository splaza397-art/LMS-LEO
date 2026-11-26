<?php
// Entrada al campus desde IINICIA (portal y app).
//
// Fase 4.10: Moodle nunca reutiliza la sesión de otra persona; entra con un comprobante firmado, de un solo uso, que
// lleva la identidad (usuario Moodle, UUID institucional y sub de Keycloak).
// Fase 5: una solicitud inválida no cierra la sesión abierta; la sesión de Moodle queda asociada al sid de Keycloak.
// Fase 4.11: el comprobante ya no sirve "al portador". La entrada tiene dos pasos, como el parámetro state de OAuth:
// 1. start: este Moodle pone en el navegador una cookie de vinculación aleatoria y lo manda al portal o a la app
//    (destinos fijos de la configuración, nunca tomados de la URL) con ese valor.
// 2. ticket: el backend firmó el comprobante para la persona autenticada y para ese valor. Moodle solo lo acepta si
//    el navegador que lo trae tiene la cookie. Un enlace copiado a otro navegador, otro dispositivo u otra cuenta no
//    sirve, y queda consumido.
// Sin parámetros (enlaces antiguos): no se reutiliza ninguna sesión; se cierra y se pasa por Keycloak.
require_once(__DIR__ . '/../../config.php');

use local_iinicia\sso_ticket;

$PAGE->set_context(context_system::instance());
$PAGE->set_url(new moodle_url('/local/iinicia/sso.php'));

// Estas respuestas llevan valores de un solo uso: que no se guarden en caché ni viajen como Referer.
@header('Cache-Control: no-store, max-age=0');
@header('Pragma: no-cache');
@header('Referrer-Policy: no-referrer');

/**
 * Muestra un error sin revelar detalles. Fase 5: una solicitud inválida (manipulada, vencida, usada, de otro navegador
 * o revocada) ya no cierra la sesión que el navegador tenga abierta: todo se valida antes de tocar la sesión, y una
 * solicitud rechazada no cambia de quién es. Solo se cierra la sesión si la comprobación final de identidad falla
 * después de haberla cambiado ($forcelogout), porque entonces el estado de la sesión ya no es confiable.
 */
$fail = function (string $key, bool $forcelogout = false) {
    sso_ticket::clear_bind_cookie();
    if ($forcelogout && isloggedin()) {
        require_logout();
    }
    throw new moodle_exception($key, 'local_iinicia', new moodle_url('/'));
};

/** Redirección 303 a un destino fijo (también a la app, que usa un esquema propio y no pasa por redirect()). */
$go = function (string $location) {
    http_response_code(303);
    header('Location: ' . $location);
    exit;
};

$raw = optional_param('ticket', '', PARAM_RAW_TRIMMED);

if (optional_param('start', 0, PARAM_BOOL)) {
    // Paso 1. Solo números para el curso o la actividad: el backend comprueba después que sean de la persona.
    $target = array_filter([
        'courseId' => optional_param('courseId', 0, PARAM_INT),
        'cmid' => optional_param('cmid', 0, PARAM_INT),
    ], fn($v) => $v > 0);
    $client = optional_param('client', 'portal', PARAM_ALPHA);
    if ($client === 'app') {
        // La app guarda un state propio y solo continúa si vuelve el mismo (otra página no puede iniciar el paso 2).
        $state = optional_param('state', '', PARAM_ALPHANUMEXT);
        if (!preg_match('/^[A-Za-z0-9_-]{16,64}$/', $state)) {
            $fail('ssoinvalid');
        }
        $go('iinicia://campus?' . http_build_query(['bind' => sso_ticket::new_bind_value(), 'state' => $state] + $target));
    }
    $portal = rtrim((string) get_config('local_iinicia', 'portalurl'), '/');
    if ($client !== 'portal' || !preg_match('#^https?://[^/\s]+$#', $portal)) {
        $fail('ssonotconfigured');
    }
    $go($portal . '/auth/campus?' . http_build_query(['bind' => sso_ticket::new_bind_value()] + $target));
}

if ($raw === '') {
    if (isloggedin() && !isguestuser()) {
        require_logout();
    }
    $issuerid = (int) get_config('local_iinicia', 'issuerid');
    if (!$issuerid) {
        throw new moodle_exception('issuernotconfigured', 'local_iinicia');
    }
    redirect(new moodle_url('/auth/oauth2/login.php', [
        'id' => $issuerid,
        'wantsurl' => (new moodle_url('/my/courses.php'))->out(false),
        'sesskey' => sesskey(),
    ]));
}

// Paso 2.
$bind = (string) ($_COOKIE[sso_ticket::BIND_COOKIE] ?? '');
try {
    $ticket = sso_ticket::verify($raw, $bind);
} catch (moodle_exception $e) {
    $known = ['ssoexpired', 'ssoused', 'ssoidentity', 'ssonotconfigured', 'ssobinding', 'ssorevoked'];
    $fail(in_array($e->errorcode, $known, true) ? $e->errorcode : 'ssoinvalid');
}
sso_ticket::clear_bind_cookie();

if (!isloggedin() || isguestuser() || (int) $USER->id !== (int) $ticket->user->id) {
    // Otra persona (o nadie): se cierra la sesión anterior y se abre una nueva. complete_user_login cambia el
    // identificador de sesión, así que una sesión fijada de antemano no sirve.
    if (isloggedin()) {
        // Cierra la sesión anterior (Moodle regenera el identificador y la deja inactiva) y abre una sesión nueva
        // vacía en la que se inicia la de quien pidió el enlace. Sin start(), el inicio no se guardaba y la persona
        // quedaba en la página de acceso (encontrado al probar el cambio portal -> app en el teléfono).
        require_logout();
        \core\session\manager::start();
    }
    complete_user_login($ticket->user);
}

// Comprobación final: la sesión resultante es exactamente la del comprobante.
if ((int) $USER->id !== (int) $ticket->user->id) {
    $fail('ssoidentity', true);
}
// Fase 5: esta sesión de Moodle queda asociada a la sesión de Keycloak del comprobante (cierre por dispositivo).
sso_ticket::link_session(session_id(), $ticket->sid, (int) $USER->id);
// Redirección a una URL limpia: el comprobante no queda en la barra de direcciones ni en el historial de la página.
redirect(new moodle_url($ticket->want));
