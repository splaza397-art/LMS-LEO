<?php
defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_iinicia_upsert_user' => [
        'classname' => 'local_iinicia\external\upsert_user',
        'description' => 'Crea, vincula o actualiza de forma idempotente una identidad IINICIA.',
        'type' => 'write',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
    'local_iinicia_set_enrolment' => [
        'classname' => 'local_iinicia\external\set_enrolment',
        'description' => 'Activa o suspende de forma idempotente una matricula manual.',
        'type' => 'write',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
    'local_iinicia_student_overview' => [
        'classname' => 'local_iinicia\external\student_overview',
        'description' => 'Devuelve cursos, progreso y actividades visibles para un usuario.',
        'type' => 'read',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
    'local_iinicia_list_courses' => [
        'classname' => 'local_iinicia\external\list_courses',
        'description' => 'Lista los cursos disponibles para asignar a programas.',
        'type' => 'read',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
    'local_iinicia_set_system_role' => [
        'classname' => 'local_iinicia\external\set_system_role',
        'description' => 'Asigna o retira de forma idempotente un rol de sistema gestionado por IINICIA.',
        'type' => 'write',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
    'local_iinicia_set_cohort_member' => [
        'classname' => 'local_iinicia\external\set_cohort_member',
        'description' => 'Crea la cohorte si no existe y agrega o retira a un miembro.',
        'type' => 'write',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
    'local_iinicia_course_progress' => [
        'classname' => 'local_iinicia\external\course_progress',
        'description' => 'Estudiantes activos de un curso con su avance y ultimo acceso.',
        'type' => 'read',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
    'local_iinicia_logout_user' => [
        'classname' => 'local_iinicia\external\logout_user',
        'description' => 'Cierra todas las sesiones de Moodle de una persona al cerrar sesion en IINICIA.',
        'type' => 'write',
        'capabilities' => 'local/iinicia:syncidentity',
    ],
];

$services = [
    'IINICIA Backend' => [
        'shortname' => 'iinicia_backend',
        'functions' => [
            'local_iinicia_upsert_user',
            'local_iinicia_set_enrolment',
            'local_iinicia_student_overview',
            'local_iinicia_list_courses',
            'local_iinicia_set_system_role',
            'local_iinicia_set_cohort_member',
            'local_iinicia_course_progress',
            'local_iinicia_logout_user',
        ],
        'restrictedusers' => 1,
        'enabled' => 1,
        'downloadfiles' => 0,
        'uploadfiles' => 0,
    ],
];
