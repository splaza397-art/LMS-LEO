<?php
defined('MOODLE_INTERNAL') || die();

/** Variables del design system IINICIA, compartidas con el portal y Android. */
function theme_iinicia_get_pre_scss($theme): string {
    return <<<'SCSS'
$primary: #1d4ed8;
$secondary: #475569;
$success: #15803d;
$danger: #b91c1c;
$warning: #b45309;
$info: #0369a1;
$dark: #172554;
$body-color: #0f172a;
$link-color: #1d4ed8;
$border-radius: .5rem;
SCSS;
}

function theme_iinicia_get_main_scss(): string {
    $preset = file_get_contents(__DIR__ . '/../boost/scss/preset/default.scss');
    return $preset . <<<'SCSS'

.navbar.fixed-top { background-color: #172554 !important; }
.navbar.fixed-top, .navbar.fixed-top .nav-link, .navbar.fixed-top a, .navbar.fixed-top .btn { color: #fff !important; }
.navbar.fixed-top .nav-link.active { border-bottom-color: #93c5fd !important; }
.navbar.fixed-top .primary-navigation .nav-link,
.navbar.fixed-top .primary-navigation .nav-link.active { background-color: transparent !important; color: #fff !important; }
.navbar.fixed-top .primary-navigation .nav-link.active { box-shadow: inset 0 -3px 0 #93c5fd; }
.navbar.fixed-top label, .navbar.fixed-top .form-check-label, .navbar.fixed-top .editmode-switch-form { color: #fff !important; }
// Moodle 5.3 dibuja la navegacion con componentes mds-*: se adaptan al fondo azul de la barra.
.navbar.fixed-top .mds-nav-pill { color: #fff !important; background-color: transparent !important; }
.navbar.fixed-top .mds-nav-pill--selected { background-color: rgba(255, 255, 255, .2) !important; }
.navbar.fixed-top .mds-switch, .navbar.fixed-top .mds-switch * { color: #fff !important; }
.card { border-radius: .75rem; }
a:focus-visible, button:focus-visible, .btn:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
// Pantalla de acceso: panel izquierdo con el azul IINICIA en lugar de la fotografia generica de Moodle.
.login-layout-left { background: #172554 none !important; }
.login-layout-left::before, .login-layout-left::after { content: none !important; display: none !important; }
.login-layout-left-content { background-color: transparent !important; color: #fff; text-align: left; }
.login-layout-left-content h2 { color: #fff; font-weight: 700; }
.login-layout-left-content p { color: #dbeafe; font-size: 1.1rem; }
// Sin formulario manual no hay nada que separar con "OR".
.login-container .login-separator { display: none; }
.login-container .login-identityproviders .btn { width: 100%; background-color: #1d4ed8; border-color: #1d4ed8; color: #fff; font-weight: 600; padding: .75rem 1rem; }
.login-container .login-identityproviders .btn:hover { background-color: #1e40af; color: #fff; }
SCSS;
}
