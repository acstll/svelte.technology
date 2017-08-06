import path from 'path';
import needle from 'needle';
import express from 'express';
import compression from 'compression';

import home from '../../universal/pages/home.html';
import blogIndex from '../../universal/pages/blog.html';
import blogPost from '../../universal/pages/blog/:id.html';
import guidePage from '../../universal/pages/guidePage.html';
import replPage from '../../universal/pages/replPage.html';

import blogPosts from '../../public/blog.json';
import guideSections from '../../public/guide.json';

const dev = !!process.env.DEV;

const app = express();

const root = path.resolve( '.' );

app.use(compression({ threshold: 0 }));

// TODO this is unfortunate... would be nice to have a neater solution
const hashed = __dev__ ? {
	bundle: '/bundle.js',
	css: '/main.css'
} : {
	bundle: require( '../manifests/bundle.json' )[ 'bundle.js' ].replace( 'client/dist', '' ),
	css: require( '../manifests/css.json' )[ 'main.css' ].replace( 'client/dist', '' )
};

const preload = [
	`<${hashed.bundle}>; rel=preload; as=script`,
	`<${hashed.css}>; rel=preload; as=style`,

	// only preload the essential fonts for initial render
	`</fonts/rajdhani-light.woff2>; rel=preload; as=font; type='font/woff2'`,
	`</fonts/roboto-regular.woff2>; rel=preload; as=font; type='font/woff2'`
].join( ', ' );

function serve (req, res, page, data) {
	res.writeHead( 200, {
		'Content-Type': 'text/html',
		Link: preload
	});

	res.write(page.render(data));
	res.end();
}

app.get( '/', ( req, res ) => {
	serve(req, res, home, { hashed });
});

app.use( ( req, res, next ) => {
	if ( req.url.slice( -1 ) === '/' && req.url.length > 1 ) {
		res.redirect( 301, req.url.slice( 0, -1 ) );
	} else {
		next();
	}
});

app.get( '/blog', ( req, res ) => {
	serve(req, res, blogIndex, { hashed, posts: blogPosts });
});

app.use( express.static( 'service-worker/dist' ) );
app.use( express.static( 'client/dist', { maxAge: dev ? '1s' : '1y' }));

app.use( '/examples', express.static( 'public/examples', {
	maxAge: 60 * 1000
}));

app.use( express.static( 'public', {
	maxAge: 1000 * 60 * 60 * 24 // one day
}));

app.get( '/blog/:slug', ( req, res ) => {
	try {
		const post = require( `${root}/public/blog/${req.params.slug}.json` );
		serve(req, res, blogPost, { hashed, post });
	} catch (err) {
		res.status(404);
		res.end('not found');
	}
});

app.get( '/guide', ( req, res ) => {
	serve(req, res, guidePage, { hashed, sections: guideSections });
});

app.get( '/repl', ( req, res ) => {
	serve(req, res, replPage, { hashed });
});

app.get( '/gists/:id', (req, res) => {
	needle.get(`https://api.github.com/gists/${req.params.id}`, {
		decode: false,
		parse: false
	}).pipe(res);
});

app.post( '/gists', (req, res) => {
	// TODO it must be possible to stream the request body to api.github.com,
	// and stream the response back again. but it has eluded me
	function error(err) {
		res.status(500);
		res.end(err.message);
	}
	let body = [];
	req.on('data', chunk => {
		body.push(chunk);
	}).on('end', () => {
		body = Buffer.concat(body).toString();

		needle.post(`https://api.github.com/gists`, body, (err, response) => {
			if (err) {
				error(err);
			} else {
				res.status(200);
				res.end(JSON.stringify(response.body));
			}
		});
	}).on('error', error);
});

app.listen( 3000, () => {
	console.log( 'listening on localhost:3000' ); // eslint-disable-line no-console
});