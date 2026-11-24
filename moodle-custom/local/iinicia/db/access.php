<?php
defined('MOODLE_INTERNAL') || die();

// Sin arquetipos: solo la cuenta de servicio del backend recibe esta capacidad.
$capabilities = [
    'local/iinicia:syncidentity' => [
        'riskbitmask' => RISK_PERSONAL | RISK_CONFIG,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [],
    ],
];
