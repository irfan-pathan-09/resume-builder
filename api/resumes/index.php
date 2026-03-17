<?php
require_once dirname(__DIR__) . '/_lib/storage.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $db = read_db();
    json_response(200, $db);
}

if ($method === 'POST') {
    if (!check_write_auth()) {
        json_response(401, ['message' => 'Unauthorized']);
    }

    $db = read_db();
    $payload = request_json();
    $id = next_id($db);
    $resume = normalize_payload($payload);
    $resume['id'] = $id;
    $db[$id] = $resume;

    if (!write_db($db)) {
        json_response(500, ['message' => 'Failed to write database']);
    }

    json_response(201, ['id' => $id, 'message' => 'Resume created']);
}

json_response(405, ['message' => 'Method not allowed']);
