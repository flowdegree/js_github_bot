
# JS Github Bot

## Build the image

`$ docker build -t flowdegree/js_github_bot .`

## Remove running instances (if any)

`$ docker stop flowdegree/js_github_bot`

`$ docker rm flowdegree/js_github_bot`

## Run the new image

`$ docker run --name js_github_bot -d flowdegree/js_github_bot`
