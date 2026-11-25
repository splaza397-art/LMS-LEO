<?php
namespace local_iinicia\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;

defined('MOODLE_INTERNAL') || die();

/**
 * Único dato propio: el registro de comprobantes de entrada al campus ya usados (id de usuario y hora), que existe
 * solo para impedir que un comprobante se use dos veces y se borra a las 24 horas. No se exporta porque no describe
 * actividad de la persona; sí se borra a petición.
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table('local_iinicia_sso_ticket', [
            'userid' => 'privacy:metadata:ssoticket:userid',
            'timecreated' => 'privacy:metadata:ssoticket:timecreated',
        ], 'privacy:metadata:ssoticket');
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $list = new contextlist();
        $list->add_from_sql('SELECT ctx.id FROM {context} ctx WHERE ctx.contextlevel = :level AND EXISTS
            (SELECT 1 FROM {local_iinicia_sso_ticket} t WHERE t.userid = :userid)',
            ['level' => CONTEXT_SYSTEM, 'userid' => $userid]);
        return $list;
    }

    public static function get_users_in_context(userlist $userlist) {
        if ($userlist->get_context()->contextlevel === CONTEXT_SYSTEM) {
            $userlist->add_from_sql('userid', 'SELECT userid FROM {local_iinicia_sso_ticket}', []);
        }
    }

    public static function export_user_data(approved_contextlist $contextlist) {
        // Registro técnico de seguridad de vida corta: no hay datos de la persona que exportar.
    }

    public static function delete_data_for_all_users_in_context(\context $context) {
        global $DB;
        if ($context->contextlevel === CONTEXT_SYSTEM) {
            $DB->delete_records('local_iinicia_sso_ticket');
        }
    }

    public static function delete_data_for_user(approved_contextlist $contextlist) {
        global $DB;
        $DB->delete_records('local_iinicia_sso_ticket', ['userid' => $contextlist->get_user()->id]);
    }

    public static function delete_data_for_users(approved_userlist $userlist) {
        global $DB;
        foreach ($userlist->get_userids() as $userid) {
            $DB->delete_records('local_iinicia_sso_ticket', ['userid' => $userid]);
        }
    }
}
