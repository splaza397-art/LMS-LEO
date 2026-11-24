<?php
namespace local_iinicia;

defined('MOODLE_INTERNAL') || die();

/**
 * Exclusion mutua entre procesos para las operaciones "buscar o crear" de los servicios web.
 *
 * Usa la fabrica de bloqueos de Moodle (en PostgreSQL, bloqueos consultivos de la base): funciona entre
 * procesos PHP y entre servidores que compartan la base. Si el proceso muere, el bloqueo se libera solo.
 */
class lock {
    /**
     * Ejecuta $fn con el recurso bloqueado.
     *
     * @param string $resource Identificador estable del recurso (por ejemplo, el UUID IINICIA).
     * @param callable $fn Trabajo a ejecutar.
     * @param int $timeout Segundos de espera antes de rendirse.
     * @return mixed Lo que devuelva $fn.
     */
    public static function run(string $resource, callable $fn, int $timeout = 30) {
        $factory = \core\lock\lock_config::get_lock_factory('local_iinicia');
        $lock = $factory->get_lock($resource, $timeout);
        if (!$lock) {
            throw new \moodle_exception('locktimeout', 'local_iinicia', '', $resource);
        }
        try {
            return $fn();
        } finally {
            $lock->release();
        }
    }
}
