<?php
namespace local_iinicia\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;

defined('MOODLE_INTERNAL') || die();

/**
 * Datos propios: el registro de comprobantes de entrada al campus ya usados (id de usuario y hora), que existe solo
 * para impedir que un comprobante se use dos veces y se borra a las 24 horas, y la hora del último cierre de sesión
 * (Fase 4.11), que invalida los comprobantes emitidos antes. No se exporta porque no describe
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
        $collection->add_database_table('local_iinicia_revocation', [
            'userid' => 'privacy:metadata:revocation:userid',
            'timerevoked' => 'privacy:metadata:revocation:timerevoked',
        ], 'privacy:metadata:revocation');
        $collection->add_database_table('local_iinicia_session_link', [
            'userid' => 'privacy:metadata:sessionlink:userid',
            'timecreated' => 'privacy:metadata:sessionlink:timecreated',
        ], 'privacy:metadata:sessionlink');
        $collection->add_database_table('local_iinicia_sid_revoked', [
            'userid' => 'privacy:metadata:sidrevoked:userid',
            'timecreated' => 'privacy:metadata:sidrevoked:timecreated',
        ], 'privacy:metadata:sidrevoked');
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $list = new contextlist();
        $list->add_from_sql('SELECT ctx.id FROM {context} ctx WHERE ctx.contextlevel = :level AND EXISTS
            (SELECT 1 FROM {local_iinicia_sso_ticket} t WHERE t.userid = :userid
             UNION SELECT 1 FROM {local_iinicia_revocation} r WHERE r.userid = :userid2
             UNION SELECT 1 FROM {local_iinicia_session_link} l WHERE l.userid = :userid3
             UNION SELECT 1 FROM {local_iinicia_sid_revoked} v WHERE v.userid = :userid4)',
            ['level' => CONTEXT_SYSTEM, 'userid' => $userid, 'userid2' => $userid, 'userid3' => $userid, 'userid4' => $userid]);
        return $list;
    }

    public static function get_users_in_context(userlist $userlist) {
        if ($userlist->get_context()->contextlevel === CONTEXT_SYSTEM) {
            $userlist->add_from_sql('userid', 'SELECT userid FROM {local_iinicia_sso_ticket}', []);
            $userlist->add_from_sql('userid', 'SELECT userid FROM {local_iinicia_revocation}', []);
            $userlist->add_from_sql('userid', 'SELECT userid FROM {local_iinicia_session_link}', []);
            $userlist->add_from_sql('userid', 'SELECT userid FROM {local_iinicia_sid_revoked}', []);
        }
    }

    public static function export_user_data(approved_contextlist $contextlist) {
        // Registro técnico de seguridad de vida corta: no hay datos de la persona que exportar.
    }

    public static function delete_data_for_all_users_in_context(\context $context) {
        global $DB;
        if ($context->contextlevel === CONTEXT_SYSTEM) {
            $DB->delete_records('local_iinicia_sso_ticket');
            $DB->delete_records('local_iinicia_revocation');
            $DB->delete_records('local_iinicia_session_link');
            $DB->delete_records('local_iinicia_sid_revoked');
        }
    }

    public static function delete_data_for_user(approved_contextlist $contextlist) {
        global $DB;
        $DB->delete_records('local_iinicia_sso_ticket', ['userid' => $contextlist->get_user()->id]);
        $DB->delete_records('local_iinicia_revocation', ['userid' => $contextlist->get_user()->id]);
        $DB->delete_records('local_iinicia_session_link', ['userid' => $contextlist->get_user()->id]);
        $DB->delete_records('local_iinicia_sid_revoked', ['userid' => $contextlist->get_user()->id]);
    }

    public static function delete_data_for_users(approved_userlist $userlist) {
        global $DB;
        foreach ($userlist->get_userids() as $userid) {
            $DB->delete_records('local_iinicia_sso_ticket', ['userid' => $userid]);
            $DB->delete_records('local_iinicia_revocation', ['userid' => $userid]);
            $DB->delete_records('local_iinicia_session_link', ['userid' => $userid]);
            $DB->delete_records('local_iinicia_sid_revoked', ['userid' => $userid]);
        }
    }
}
