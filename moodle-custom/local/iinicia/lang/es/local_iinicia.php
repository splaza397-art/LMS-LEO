<?php
defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Integración IINICIA';
$string['iinicia:syncidentity'] = 'Sincronizar identidades y matrículas IINICIA';
$string['identityconflict'] = 'El correo ya pertenece a otra identidad IINICIA.';
$string['issuernotconfigured'] = 'El proveedor de identidad IINICIA no está configurado.';
$string['manualenrolmissing'] = 'El curso no tiene una instancia de matriculación manual.';
$string['locktimeout'] = 'Otra sincronización del mismo recurso sigue en curso ({$a}). Se reintentará.';
$string['ssoinvalid'] = 'El enlace al campus no es válido. Vuelve a entrar desde IINICIA.';
$string['ssoexpired'] = 'El enlace al campus venció. Vuelve a entrar desde IINICIA.';
$string['ssoused'] = 'Este enlace al campus ya se usó. Vuelve a entrar desde IINICIA.';
$string['ssoidentity'] = 'No se pudo comprobar tu identidad en el campus. Vuelve a entrar desde IINICIA.';
$string['ssonotconfigured'] = 'La entrada al campus desde IINICIA no está configurada.';
$string['privacy:metadata:ssoticket'] = 'Comprobantes de entrada al campus ya usados, para impedir que se usen dos veces. Se borran a las 24 horas.';
$string['privacy:metadata:ssoticket:userid'] = 'Usuario que usó el comprobante.';
$string['privacy:metadata:ssoticket:timecreated'] = 'Hora de uso.';
$string['ssobinding'] = 'Este enlace al campus se abrió en un navegador distinto del que lo pidió. Vuelve a entrar desde IINICIA en este dispositivo.';
$string['ssorevoked'] = 'Este enlace al campus ya no es válido porque se cerró la sesión. Vuelve a entrar desde IINICIA.';
$string['privacy:metadata:revocation'] = 'Hora del último cierre de sesión en IINICIA, para que los enlaces al campus emitidos antes ya no sirvan.';
$string['privacy:metadata:revocation:userid'] = 'Usuario que cerró sesión.';
$string['privacy:metadata:revocation:timerevoked'] = 'Hora del cierre de sesión.';
