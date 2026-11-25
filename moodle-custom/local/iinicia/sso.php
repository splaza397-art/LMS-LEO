<?php
// Entrada al campus desde IINICIA (portal y app).
//
// Fase 4.10: antes, si el navegador ya tenía una sesión de Moodle abierta se reutilizaba sin comprobar de quién era,
// y la persona siguiente en un equipo compartido entraba a la cuenta anterior. Ahora:
// - Con comprobante (ticket) del backend: se verifica firma, vigencia, uso único y la correspondencia entre usuario
//   Moodle, UUID institucional y sub de Keycloak. Si la sesión abierta es de otra persona, se cierra antes de abrir la
//   de quien pidió el enlace, y al final se vuelve a comprobar la identidad.
// - Sin comprobante (enlaces antiguos): no se reutiliza ninguna sesión; se cierra y se pasa por Keycloak.
require_once(__DIR__ . '/../../config.php');

$PAGE->set_context(context_system::instance());
$PAGE->set_url(new moodle_url('/local/iinicia/sso.php'));

/** Muestra un error sin revelar detalles y sin dejar ninguna sesión abierta. */
$fail = function (string $key) {
    if (isloggedin()) {
        require_logout();
    }
    throw new moodle_exception($key, 'local_iinicia', new moodle_url('/'));
};

$raw = optional_param('ticket', '', PARAM_RAW_TRIMMED);

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

try {
    $ticket = \local_iinicia\sso_ticket::verify($raw);
} catch (moodle_exception $e) {
    $fail(in_array($e->errorcode, ['ssoexpired', 'ssoused', 'ssoidentity', 'ssonotconfigured'], true) ? $e->errorcode : 'ssoinvalid');
}

if (!isloggedin() || isguestuser() || (int) $USER->id !== (int) $ticket->user->id) {
    // Otra persona (o nadie): se cierra la sesión anterior y se abre una nueva. complete_user_login cambia el
    // identificador de sesión, así que una sesión fijada de antemano no sirve.
    if (isloggedin()) {
        require_logout();
    }
    complete_user_login($ticket->user);
}

// Comprobación final: la sesión resultante es exactamente la del comprobante.
if ((int) $USER->id !== (int) $ticket->user->id) {
    $fail('ssoidentity');
}
redirect(new moodle_url($ticket->want));
