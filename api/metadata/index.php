<?php
require_once dirname(__DIR__) . '/_lib/storage.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    json_response(405, ['message' => 'Method not allowed']);
}

$type = strtolower(trim((string)($_GET['type'] ?? '')));
$allowed = ['skills', 'tags', 'degrees', 'countries'];
if (!in_array($type, $allowed, true)) {
    json_response(404, ['message' => 'Metadata type not found']);
}

$db = read_db();
$values = [];

foreach ($db as $resume) {
    if ($type === 'skills') {
        foreach (($resume['skills'] ?? []) as $skill) {
            $name = trim((string)($skill['name'] ?? ''));
            if ($name !== '') $values[strtolower($name)] = $name;
        }
    }
    if ($type === 'tags') {
        foreach (($resume['tags'] ?? []) as $tag) {
            $tag = trim((string)$tag);
            if ($tag !== '') $values[strtolower($tag)] = $tag;
        }
    }
    if ($type === 'degrees') {
        foreach (($resume['education'] ?? []) as $edu) {
            $degree = trim((string)($edu['degree'] ?? ''));
            if ($degree !== '') $values[strtolower($degree)] = $degree;
        }
    }
    if ($type === 'countries') {
        $country = trim((string)($resume['personalInfo']['country'] ?? ''));
        if ($country !== '') $values[strtolower($country)] = $country;
    }
}

$result = array_values($values);
sort($result, SORT_NATURAL | SORT_FLAG_CASE);
json_response(200, $result);
