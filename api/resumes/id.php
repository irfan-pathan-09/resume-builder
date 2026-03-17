<?php
require_once dirname(__DIR__) . '/_lib/storage.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$id = isset($_GET['id']) ? trim((string)$_GET['id']) : '';

if ($id === '') {
    json_response(400, ['message' => 'Resume ID is required']);
}

$db = read_db();
$existing = $db[$id] ?? null;

if ($method === 'GET') {
    if ($existing === null) {
        json_response(404, ['message' => 'Resume not found']);
    }
    json_response(200, $existing);
}

if ($method === 'PUT' || $method === 'PATCH') {
    if (!check_write_auth()) {
        json_response(401, ['message' => 'Unauthorized']);
    }
    if ($existing === null) {
        json_response(404, ['message' => 'Resume not found']);
    }

    $payload = request_json();
    $updated = normalize_payload($payload, $existing);
    $updated['id'] = $id;
    $db[$id] = $updated;

    if (!write_db($db)) {
        json_response(500, ['message' => 'Failed to write database']);
    }

    json_response(200, ['id' => $id, 'message' => 'Resume updated']);
}

if ($method === 'DELETE') {
    if (!check_write_auth()) {
        json_response(401, ['message' => 'Unauthorized']);
    }
    if ($existing === null) {
        json_response(404, ['message' => 'Resume not found']);
    }

    unset($db[$id]);
    if (!write_db($db)) {
        json_response(500, ['message' => 'Failed to write database']);
    }

    json_response(200, ['id' => $id, 'message' => 'Resume deleted']);
}

json_response(405, ['message' => 'Method not allowed']);
