<?php
define('ROOT', 'stack6');

function page_title($path) {
	$arr = explode(DIRECTORY_SEPARATOR, $path);
	return ucfirst( end($arr) );
}

function layout($name) {
	include("__shared/$name.htm");
}
?>