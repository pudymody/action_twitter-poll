# action_twitter-poll
This is a github action to poll for twitter of a user, and write them as a hugo content files. This is used in my own website as an intent to follow the indieweb movement.

## Usage example

To use this, you only need to set it in your workflow with
```yaml
- uses: pudymody/action_twitter-poll
    with:
        base: "./"
        image_path: "./"
        token: ${{ secrets.TWITTER_TOKEN }}
        user: "pudymody"
        count: 50
```

In my opinion the best workflow its to combine it with a checkout and a commit.
```yaml
jobs:
    build:
        name: Poll
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@master
            - uses: ./.github/actions/twitter_poller
            with:
                base: "./"
                image_path: "./"
                token: ${{ secrets.TWITTER_TOKEN }}
                user: "pudymody"
        - name: Commit changes
            uses: elstudio/actions-js-build/commit@v2
            env:
                GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Development setup

If you want to test or contribute:
1. You need [NodeJS](https://nodejs.org/en/) installed.
2. ```npm install``` from the repository.
3. Set the following environment variables:
    * *INPUT_BASE*: Where to store the content files. This route is relative to the *content* folder from where the script is being called.
    * *INPUT_IMAGE_PATH*: Where to store image files. This route is relative to the *static* folder from where the script is being called.
    * *INPUT_TOKEN*: Your twitter bearer token.
    * *INPUT_USER*: The user you want to poll.
    * *INPUT_COUNT*: How many tweets you want to retrieve.
8. To run the script, ```npm start```