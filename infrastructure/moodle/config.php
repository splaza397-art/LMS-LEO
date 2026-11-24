<?php
// Configuracion de Moodle por variables de entorno: ningun secreto vive en el repositorio.
unset($CFG);
global $CFG;
$CFG = new stdClass();

$CFG->dbtype = 'pgsql';
$CFG->dblibrary = 'native';
$CFG->dbhost = getenv('MOODLE_DB_HOST');
$CFG->dbname = getenv('MOODLE_DB_NAME');
$CFG->dbuser = getenv('MOODLE_DB_USER');
$CFG->dbpass = getenv('MOODLE_DB_PASSWORD');
$CFG->prefix = 'mdl_';
$CFG->dboptions = ['dbpersist' => 0, 'dbport' => 5432, 'dbsocket' => ''];

$CFG->wwwroot = rtrim(getenv('MOODLE_WWWROOT'), '/');
$CFG->dataroot = '/var/www/moodledata';
$CFG->admin = 'admin';
$CFG->directorypermissions = 02770;
$CFG->routerconfigured = true;

// Solo DEV: Keycloak se alcanza por la red privada de Docker.
if (getenv('MOODLE_ALLOW_PRIVATE_HOSTS') === 'true') {
    $CFG->curlsecurityblockedhosts = '';
    $CFG->curlsecurityallowedport = '';
}

if (getenv('MOODLE_DEBUG') === 'true') {
    $CFG->debug = E_ALL;
    $CFG->debugdisplay = 1;
}

$CFG->smtphosts = 'mailpit:1025';
$CFG->noreplyaddress = 'no-responder@iinicia.local';

require_once(__DIR__ . '/lib/setup.php');
