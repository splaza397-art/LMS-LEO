<?php
namespace local_iinicia\privacy;

/** El plugin no almacena datos personales propios. */
class provider implements \core_privacy\local\metadata\null_provider {
    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
