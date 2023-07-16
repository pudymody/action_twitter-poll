const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const got = require("got");

const BASE = process.env.INPUT_BASE;
const IMAGE_PATH = process.env.INPUT_IMAGE_PATH;
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

// https://git.sr.ht/~cloutier/bird.makeup/tree/master/item/src/BirdsiteLive.Twitter/Tools/TwitterAuthenticationInitializer.cs#L36
const _apiKeys =  [
	["IQKbtAYlXLripLGPWd0HUA", "GgDYlkSvaPxGxC4X8liwpUoqKwwr3lCADbz8A7ADU"], // iPhone
	["3nVuSoBZnx6U4vzUxf5w", "Bcs59EFbbsdF6Sl9Ng71smgStWEGwXXKSjYvPVt7qys"], // Android
	["CjulERsDeqhhjSme66ECg", "IQWdVyqFxghAtURHGeGiWAsmCAGmdW3WmbEx6Hck"], // iPad
	["3rJOl1ODzm9yZy63FACdg", "5jPoQ5kQvMJFDYRNE8bQ4rHuds4xJqhvgNJM4awaE8"], // Mac
];

(async function(){
	let LAST_TWEET;

	try {
		LAST_TWEET = await fs.promises.readFile("LAST_TWEET", "utf8");
	} catch (error) {
		if( error.code != "ENOENT" ){
			throw error;
		}
	}

	let LAST_TWEET_CREATED_AT = 0;

	const selectedApi = _apiKeys[Math.floor(Math.random() * _apiKeys.length)]
	const authBase64 = btoa(`${selectedApi[0]}:${selectedApi[1]}`);
 	const bearer = await got("https://api.twitter.com/oauth2/token?grant_type=client_credentials", {
 		method: "POST",
 		json: true,
		headers: {
			authorization: `Basic ${authBase64}`
		}
 	}).then( ({body}) => body.access_token );

 	const gtoken = await got("https://api.twitter.com/1.1/guest/activate.json", {
 		method: "POST",
 		headers: {
 			authorization: "Bearer " + bearer
 		},
 		json: true
 	}).then( ({body}) => body.guest_token );

 	const data = await got(`https://api.twitter.com/graphql/pNl8WjKAvaegIoVH--FuoQ/UserTweetsAndReplies?variables=%7B%22userId%22%3A%22${USER}%22,%22count%22%3A${COUNT},%22includePromotedContent%22%3Atrue,%22withCommunity%22%3Atrue,%22withSuperFollowsUserFields%22%3Atrue,%22withDownvotePerspective%22%3Afalse,%22withReactionsMetadata%22%3Afalse,%22withReactionsPerspective%22%3Afalse,%22withSuperFollowsTweetFields%22%3Atrue,%22withVoice%22%3Atrue,%22withV2Timeline%22%3Atrue%7D&features=%7B%22responsive_web_twitter_blue_verified_badge_is_enabled%22%3Atrue,%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue,%22verified_phone_label_enabled%22%3Afalse,%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue,%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse,%22tweetypie_unmention_optimization_enabled%22%3Atrue,%22vibe_api_enabled%22%3Atrue,%22responsive_web_edit_tweet_api_enabled%22%3Atrue,%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue,%22view_counts_everywhere_api_enabled%22%3Atrue,%22longform_notetweets_consumption_enabled%22%3Atrue,%22tweet_awards_web_tipping_enabled%22%3Afalse,%22freedom_of_speech_not_reach_fetch_enabled%22%3Afalse,%22standardized_nudges_misinfo%22%3Atrue,%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Afalse,%22interactive_text_enabled%22%3Atrue,%22responsive_web_text_conversations_enabled%22%3Afalse,%22longform_notetweets_richtext_consumption_enabled%22%3Afalse,%22responsive_web_enhance_cards_enabled%22%3Afalse%7D`, {
 		method: "GET",
 		headers: {
 			authorization: "Bearer " + bearer,
 			"x-guest-token": gtoken,
 			"x-twitter-active-user": "yes",
			"Referer": "https://twitter.com/"
		},
 		json: true
 	}).then( ({body}) => body );

	let tweets = data.data.user.result.timeline_v2.timeline.instructions.find( i => i.type == "TimelineAddEntries" ).entries.map( a => a.content ).filter(a => a.entryType == "TimelineTimelineItem" || (a.entryType == "TimelineTimelineModule" && a.displayType == "VerticalConversation"))
	.map(a => {
		if( a.entryType == "TimelineTimelineItem" ){
			return a.itemContent.tweet_results.result
		}

		return a.items.map( b => b.item.itemContent.tweet_results.result )
	})
	.flat()
	.map( a => {
		if( a.hasOwnProperty("tweet") ){
			return a.tweet.legacy;
		}else{
			return a.legacy;
		}
	})
	.filter( tw => tw.retweeted || tw.user_id_str == USER )
	.map(a => {
		if( a.hasOwnProperty("retweeted_status_result") ){
			if( a.retweeted_status_result.result.hasOwnProperty("legacy") ){
				a.retweeted_status = a.retweeted_status_result.result.legacy;
				a.retweeted_status.user = a.retweeted_status_result.result.core.user_results.result.legacy;
			}

			if( a.retweeted_status_result.result.hasOwnProperty("tweet") ){
				a.retweeted_status = a.retweeted_status_result.result.tweet.legacy;
				a.retweeted_status.user = a.retweeted_status_result.result.tweet.core.user_results.result.legacy;
			}

		}

		return a;
	});

	tweets = tweets.map( tw => {
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

	console.log(`Got ${tweets.length} new tweets.`);
	for(let item of tweets){
		let name = item.id_str + ".md";
		if( item.retweeted_status ){
			name = "rt_" + name;
		}

		for(let img of item.frontMatter.media){
			console.log("Wrote a new media");
			await download(img.url, img.path);
		}

		item.frontMatter.media = item.frontMatter.media.map( i => path.join("/", IMAGE_PATH, i.name) );

		content = "---\n";
		content += yaml.safeDump(item.frontMatter);
		content += "---\n";
		content += item.full_text;

		images = item.frontMatter.media.map(url => `![Image](${url})`).join("\n\n");
		content += `\n\n${images}`;

		if( LAST_TWEET_CREATED_AT < new Date(item.created_at) ){
			LAST_TWEET_CREATED_AT = new Date(item.created_at);
			LAST_TWEET = item.id_str;
		}

		console.log("Wrote a new file");
		await fs.promises.writeFile( path.join("content",BASE,name), content);
	}

	await fs.promises.writeFile("LAST_TWEET", LAST_TWEET);
})();
