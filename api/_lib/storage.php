<?php

function json_response($status, $payload) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function db_path() {
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'db.json';
}

function read_db() {
    $path = db_path();
    if (!file_exists($path)) {
        return [];
    }

    $raw = file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function write_db($data) {
    $path = db_path();
    $fp = fopen($path, 'c+');
    if ($fp === false) {
        return false;
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return false;
    }

    ftruncate($fp, 0);
    rewind($fp);
    $written = fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    return $written !== false;
}

function request_json() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function expected_api_key() {
    $envKey = getenv('ADMIN_API_KEY');
    if (is_string($envKey) && $envKey !== '') {
        return $envKey;
    }
    return 'your_secret_admin_key';
}

function check_write_auth() {
    $provided = $_SERVER['HTTP_X_API_KEY'] ?? '';
    return hash_equals(expected_api_key(), $provided);
}

function normalize_payload($payload, $existing = null) {
    $base = is_array($existing) ? $existing : [];
    $incoming = is_array($payload) ? $payload : [];

    $merged = array_merge($base, $incoming);
    $merged['personalInfo'] = array_merge(
        $base['personalInfo'] ?? [],
        $incoming['personalInfo'] ?? []
    );

    if (!empty($incoming['profilePhotoOriginalBase64'])) {
        $merged['personalInfo']['profilePhotoOriginalUrl'] = $incoming['profilePhotoOriginalBase64'];
    }
    if (!empty($incoming['profilePhotoCroppedBase64'])) {
        $merged['personalInfo']['profilePhotoCroppedUrl'] = $incoming['profilePhotoCroppedBase64'];
    }

    unset($merged['profilePhotoOriginalBase64'], $merged['profilePhotoCroppedBase64']);
    return $merged;
}

function next_id($db) {
    $max = 0;
    foreach (array_keys($db) as $key) {
        $n = intval($key);
        if ($n > $max) $max = $n;
    }
    return strval($max + 1);
}

