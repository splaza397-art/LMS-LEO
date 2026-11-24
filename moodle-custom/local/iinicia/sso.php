<?php
// Punto de entrada "Mi Campus": inicia el login OIDC sin mostrar el formulario de Moodle.
require_once(__DIR__ . '/../../config.php');

$wantsurl = optional_param('wantsurl', '/my/courses.php', PARAM_LOCALURL);
$PAGE->set_context(context_system::instance());
$PAGE->set_url(new moodle_url('/local/iinicia/sso.php'));

if (isloggedin() && !isguestuser()) {
    redirect(new moodle_url($wantsurl));
}

$issuerid = (int) get_config('local_iinicia', 'issuerid');
if (!$issuerid) {
    throw new moodle_exception('issuernotconfigured', 'local_iinicia');
}
redirect(new moodle_url('/auth/oauth2/login.php', [
    'id' => $issuerid,
    'wantsurl' => (new moodle_url($wantsurl))->out(false),
    'sesskey' => sesskey(),
]));
