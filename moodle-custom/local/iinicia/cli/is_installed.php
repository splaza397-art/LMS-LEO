<?php
// Sale con 0 si Moodle ya esta instalado. No carga config.php porque Moodle aun podria no tener tablas.
$conn = pg_connect(sprintf(
    "host=%s dbname=%s user=%s password='%s'",
    getenv('MOODLE_DB_HOST'),
    getenv('MOODLE_DB_NAME'),
    getenv('MOODLE_DB_USER'),
    addcslashes(getenv('MOODLE_DB_PASSWORD'), "'\\")
));
if (!$conn) {
    fwrite(STDERR, "No se pudo conectar a la base de Moodle\n");
    exit(2);
}
$result = pg_query($conn, "SELECT to_regclass('public.mdl_config') IS NOT NULL AS installed");
exit(pg_fetch_result($result, 0, 0) === 't' ? 0 : 1);
