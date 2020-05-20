const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const got = require("got");

const BASE = process.env.INPUT_BASE;
const IMAGE_PATH = process.env.INPUT_IMAGE_PATH;
const TOKEN = process.env.INPUT_TOKEN;
const USER = process.env.INPUT_USER;
const COUNT = process.env.INPUT_COUNT;

async function download(url, path){
	return new Promise(function(resolve,reject){
		let s = fs.createWriteStream(path);
		s.on("finish", resolve);
		s.on("error", reject);

		got(url, { stream: true }).pipe(s);
	});
}

(async function(){
	let query = {
		screen_name: USER,
		count: COUNT,
		tweet_mode: 'extended'
	};

	let LAST_TWEET;

	try {
		LAST_TWEET = await fs.promises.readFile("LAST_TWEET", "utf8");
		if( LAST_TWEET !== "" ){
			query.since_id = LAST_TWEET;
		}
	} catch (error) {
		if( error.code != "ENOENT" ){
			throw error;
		}
	}

	let LAST_TWEET_CREATED_AT = 0;

	let new_tweets = await got("https://api.twitter.com/1.1/statuses/user_timeline.json", {
		method: "GET",
		headers: {
			authorization: "Bearer " + TOKEN
		},
		query:query,
		json: true
	}).then( ({body}) => body );

	new_tweets = new_tweets.map( tw => {
		tw.frontMatter = {
			date: tw.created_at,
			layout: "post",
			syndicateUrl: ["https://twitter.com/pudymody/status/" + tw.id_str],
			media: []
		}

		return tw;
	}).map( tw => {
		if( tw.retweeted_status ){
			tw.frontMatter.authorName = tw.retweeted_status.user.name;
			tw.frontMatter.authorUrl = "https://twitter.com/" + tw.retweeted_status.user.screen_name;
			tw.frontMatter.originalPost = "https://twitter.com/"+ tw.retweeted_status.user.screen_name +"/status/" + tw.retweeted_status.id_str;

			tw.in_reply_to_status_id_str = tw.retweeted_status.in_reply_to_status_id_str;
			tw.in_reply_to_screen_name = tw.retweeted_status.in_reply_to_screen_name;
			tw.full_text = tw.retweeted_status.full_text;
			tw.entities = tw.retweeted_status.entities;
		}

		return tw;
	})
	.map( tw => {
		if( tw.in_reply_to_status_id_str ){
			tw.frontMatter.inReplyTo = "https://twitter.com/" + tw.in_reply_to_screen_name + "/status/" + tw.in_reply_to_status_id_str;
		}

		return tw;
	})
	.map( tw => {
		if( tw.entities.hasOwnProperty("urls") ){
			for( let link of tw.entities.urls ){
				tw.full_text = tw.full_text.replace( link.url, "["+link.expanded_url+"]("+link.expanded_url+")")
			}
		}

		return tw;
	})
	.map( tw => {
		if( tw.entities.hasOwnProperty("media") ){
			for( let img of tw.entities.media ){
				tw.full_text = tw.full_text.replace( img.url, "");
				tw.frontMatter.media.push({
					url: img.media_url_https,
					path: path.join( "static", IMAGE_PATH, path.basename(img.media_url_https) ),
					name: path.basename(img.media_url_https),
				});
			}
		}

		return tw;
	})

	console.log(`Got ${new_tweets.length} new tweets.`);

	new_tweets = new_tweets.reduce(function(prev,curr){
		let date_obj = new Date(curr.frontMatter.date);
		let month = String( date_obj.getUTCMonth() + 1 ).padStart(2, "0");
		let year = date_obj.getUTCFullYear();
		let key = `${year}-${month}`;


		if( !prev.hasOwnProperty(key) ){
			prev[ key ] = [];
		}

		prev[ key ].push(curr);
		return prev;
	},{});

	for(let [key,tweets] of Object.entries(new_tweets)){

		const folder = path.join(BASE, key);
		const folder_index = path.join(folder, "_index.md");

		try {
			await fs.promises.mkdir(folder, { recursive: true });
			await fs.promises.writeFile(folder_index, "");
		} catch(err) {
			if( err.code != "EEXIST" ){
				throw err;
			}
		}

		for( item of tweets ){
			let name = item.id_str + ".md";
			if( item.retweeted_status ){
				name = "rt_" + name;
			}
			const file_path = path.join(BASE, key, name);

			for(let img of item.frontMatter.media){
				console.log("Wrote a new media");
				await download(img.url, img.path);
			}

			item.frontMatter.media = item.frontMatter.media.map( i => path.join("/", IMAGE_PATH, i.name) );

			content = "---\n";
			content += yaml.safeDump(item.frontMatter);
			content += "---\n";
			content += item.full_text;

			if( LAST_TWEET_CREATED_AT < new Date(item.created_at) ){
				LAST_TWEET_CREATED_AT = new Date(item.created_at);
				LAST_TWEET = item.id_str;
			}

			console.log("Wrote a new file");
			await fs.promises.writeFile( file_path, content);
		}

	}
	await fs.promises.writeFile("LAST_TWEET", LAST_TWEET);
})();
