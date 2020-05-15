const { writeFileSync, readFileSync, existsSync, readdirSync, statSync } = require('fs');
const { join, extname, dirname, basename, relative, sep } = require('path');
const chokidar = require('chokidar');
const sass = require('sass');
const rollup = require('rollup');
const rtlcss = require('rtlcss');
const Terser = require('terser');

colors();
const log = console.log;
const args = process.argv.slice(2);

if ( args.includes('b') ) {
	runJs(undefined, undefined, true);
	runSass(undefined, undefined, true);
	runTemp(undefined, undefined, true)
} else {
	watch('./public/__shared/**/*', runShared);
	
	['public', ...getDirs('./public', '!_|\\.$')].forEach(i => {
		const page = i.replace(/\\/g, '/');
		const pageName = page.replace(/^public\/?/, '');
		
		watch(page+'/_js/**/*', runJs, pageName);
		watch(page+'/_scss/**/*', runSass, pageName);
		watch(page+'/_tmpl/**/*', runTemp, pageName);
		watch(page+'/_app/style.css', runRtlcss, pageName);
	});
	
	live();
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// shared stuff
function runShared(x, info) {
	if (!info) return;
	const [, path] = info;
	const ext = extname(path);
	if ( ['.js','.scss','.tmpl'].includes(ext) ) log(info[0].grey, info[1].grey);
	ext === '.js'   ? runJs(undefined, undefined, true) : 
	ext === '.scss' ? runSass(undefined, undefined, true) : 
	ext === '.tmpl' ? runTemp(undefined, undefined, true) : undefined;
	log('Ran shared.'.green);
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// js
function runJs(page='', info, full=false) {
	const dir = full ? './public' : join('./public', page, '_js');
	const entries = getFiles(dir, 'main.js$');
	
	entries.forEach(entry => {
		const depGraph = getDependencyGraph(entry).map(i => i.replace(/^.+(_js)/, '$1'));
		const modulepreloadLinks = depGraph.map(i => `<link rel="modulepreload" href="${i}" />`).join('\n');
		const moduleScripts      = depGraph.map(i => `<script type="module" src="${i}"></script>`).join('\n');
		const outDir = join(dirname(entry), '../', '_app')
		writeFileSync(join(outDir, 'modulepreload-links.htm'), modulepreloadLinks);
		writeFileSync(join(outDir, 'module-scripts.htm'), moduleScripts);
	});
	log('Ran js.'.green);
}
function getDependencyGraph(entry, files, result=[]) {
	if (entry) files = [entry = join(entry)];
	for (const file of files) {
		const content = readFileSync(file, 'utf8');
		const matchesIterator = content.matchAll(/import.+from\s+'(.+)'/g);
		let matches = [];
		for (const match of matchesIterator) {
			const groups = match.slice(1).map( i => join(dirname(file), i) );
			matches.push(...groups);
		}
		if (matches.length) {
			result.push(...matches);
			getDependencyGraph(undefined, matches, result);
		}
	}
	if (entry) return [entry, ...new Set(result)].map(i => i.replace(/\\/g, '/')).reverse();
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// sass
function runSass(page='', info, full=false) {
	if (info) log(info[0].grey, info[1].grey);
	const dir = full ? './public' : join('./public', page, '_scss');
	const entries = getFiles(dir, 'style.scss$');
	
	let err;
	entries.forEach(entry => {
		const pardir = join(dirname(entry), '../');
		const outFile = join(pardir, '_app', 'style.css');
		// const result = sass.renderSync({file: entry, outFile});
		try {
			const result = sass.renderSync({file: entry, outFile});
			writeFileSync(outFile, result.css.toString());
			log('Wrote:             '.grey, outFile.grey);
		} catch (error) {
			log(error.message.redB);
			err = true;
			log('Couldn\'t write:    '.grey, outFile.grey);
		}
	});
	log('Ran sass.'[err ? 'red' : 'green']);
}

function runRtlcss(page='', info, full=false) {
	const dir = full ? './public' : join('./public', page, '_app');
	const entries = getFiles(dir, 'style.css$');
	
	for (const entry of entries) {
		writeFileSync(join(dir, 'style-rtl.css'), rtlcss.process(readFileSync(entry, 'utf8')));
	}
	log('Ran rtlcss.'.green);
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// templates
function runTemp(page='', info, full=false) {
	const entries = full ? getDirs('./public', '_tmpl$') : [ join('./public', page, '_tmpl') ];
	
	entries.forEach(entry => {
		if ( !existsSync(entry) ) return;
		let str = 'const _templates = {};\n';
		getFiles(entry).forEach(file => {
			const key = basename(file).replace(extname(file), '');
			str += "_templates['"+key+"'] = function (c={}) { return `"+ readFileSync(file, 'utf8') + "` };\n";
		});
		writeFileSync(join(entry, '../_app', '_templates.js'), str);
	});
	log('Ran templates.'.green);
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// livereload
function live() {
	const livereload = require('livereload');
	const port = existsSync('.livereload') && readFileSync('.livereload', 'utf8').match(/:(\d+)\/livereload.js\?snipver=1/)[1];
	const lrserver = livereload.createServer({...port && {port}});
	
	const toBeWatched= ['public', ...getDirs('./public', '!_|\\.$')]
		.map(i => {
			const page = i.replace(/\\/g, '/');
			return [page+'/index.html', page+'/_app/**/*', page+'/_lib/**/*'];
		})
		.reduce((a,c) => a.push(...c) && a, [])
		.map( i => join(__dirname, i) );
	
	lrserver.watch(toBeWatched);
	log('livereload started...'.magentaB);
}
function toggleManualLivereload() {
	const port = Math.floor(Math.random()*(65000-36000+1))+36000;
	const str = `<script>document.write('<script src=\"http://' + (location.host || 'localhost').split(':')[0] + ':${port}/livereload.js?snipver=1\"></' + 'script>')</script>`;
	const file = '.livereload';
	if ( existsSync(file) ) {
		unlinkSync(file);
		log('Off'.bRed);
	} else {
		writeFileSync(file, str);
		log('On'.bGreen);
	}
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// release
async function bundleJs() {
	const entries = getFiles('./public').filter(i => basename(i) === 'main.js');
	for (const entry of entries) {
		const bundle = await rollup.rollup({input: entry});
		const pardir = join(dirname(entry), '../');
		await bundle.write({file: join(pardir, 'bundle.js'), format: 'iife'});
	}
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// util
function watch(path, fn, fnArg) {
	const a = fnArg;
	fn(a);
	const watcher = chokidar.watch(path).on('ready', () => {
		watcher
			.on('add',       path => fn(a, ['File Added:        ',path]))
			.on('addDir',    path => fn(a, ['Folder Added:      ',path]))
			.on('unlink',    path => fn(a, ['File Deleted:      ',path]))
			.on('unlinkDir', path => fn(a, ['Folder Deleted:    ',path]))
			.on('change',    path => fn(a, ['Modified:          ',path]))
			.on('error', error => log(error.redB));
		log('Watching...'.magentaB, path.whiteB);
	});
}
function colors() {
	[
		['red',      31],
		['green',    32],
		['grey',     90],
		['redB',     91],
		['greenB',   92],
		['yellowB',  93],
		['magentaB', 95],
		['whiteB',   97],
	].forEach(([k, n]) => {
		String.prototype.__defineGetter__(k, function () {
			return `[${n}m${this}[0m`;
		});
	});
}
function getFiles(dir, patterns=[], res=[]) {
	if ( !existsSync(dir) ) return res;
	if (typeof patterns === 'string') patterns = [patterns];
	const files = readdirSync(dir);
	for (const file of files) {
		const path = join(dir, file);
		const stats = statSync(path);
		if ( stats.isDirectory() ) {
			getFiles(path, patterns, res);
		} else {
			if (patterns.length) {
				const invalid = patterns.map(i => i[0] === '!' ? !new RegExp(i.slice(1)).test(path) : new RegExp(i).test(path)).filter(i=>!i).length;
				if (!invalid) res.push(path);
			} else {
				res.push(path);
			}
		}
	}
	return res;
}
function getDirs(dir, patterns=[], res=[]) {
	if (typeof patterns === 'string') patterns = [patterns];
  const items = readdirSync(dir);
  for (const i of items) {
    const path = join(dir, i);
    const stats = statSync(path);
    if ( stats.isDirectory() ) {
			if (patterns.length) {
				const invalid = patterns.map(i => i[0] === '!' ? !new RegExp(i.slice(1)).test(path) : new RegExp(i).test(path)).filter(i=>!i).length;
				if (!invalid) res.push(path);
			} else {
				res.push(path);
			}
      // res.push(path);
      getDirs(path, patterns, res);
    }
  }
	return res;
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// just in case

/* getting depGraph with rollup
const bundle = await rollup.rollup({input: entry});
const depGraph = bundle.watchFiles.map(i => relative('./', i).replace(/(\\|\/)+/g, '/').replace(/^.+(_js)/,'$1')).reverse();
*/

/* concating depGraph (not bundling)
entries.forEach(entry => {
	const deps = getDependencyGraph(entry);
	let str = '';
	str += '(function () {\n';
	str += deps.reduce((a,c) => a += readFileSync(c, 'utf8')+'\n', '');
	str += '})();';
	
	const pardir = join(dirname(entry), '../');
	const outFile = join(pardir, 'bundle.js');
	writeFileSync(outFile, str);
});
*/
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@