import { Controller, Get, Query, Request, Response } from '@nestjs/common';
import { DatabaseManager } from '../db-manager.service';
import { SpotifyService } from '../spotify.service';

@Controller()
export class AppController {
  constructor(
    private readonly spotifyService: SpotifyService,
    private readonly dbManager: DatabaseManager
  ) {}

  // refactor controllers to different files later
  @Get('search')
  async getData(@Query() query) {
    const res = await this.dbManager.getData(query);
    return res;
  }

  @Get('db-test')
  async testDb() {
    const res = await this.dbManager.getCountOfNodesInDb();
    return res;
  }

  @Get('web-search')
  async getWebData(@Query() query) {
    const res = await this.spotifyService.getWebData(query);
    return res;
  }

  @Get('login')
  async loginToSpotify(@Response() response) {
    response.redirect(
      this.spotifyService.SpotifyWebApi.createAuthorizeURL(
        this.spotifyService.scopes,
        'some-state-of-my-choice'
      )
    );
  }

  @Get('callback')
  async callback(@Request() request, @Response() response) {
    const error = request.query.error;
    const code = request.query.code;
    // const state = request.query.state;

    if (error) {
      console.log('Callback error: ', error);
      return error;
    }

    this.spotifyService.SpotifyWebApi.authorizationCodeGrant(code)
      .then((data) => {
        const access_token = data.body['access_token'];
        const refresh_token = data.body['refresh_token'];
        const expires_in = data.body['expires_in'];

        // set up guard to monitor expiring token

        this.spotifyService.SpotifyWebApi.setAccessToken(access_token);
        this.spotifyService.SpotifyWebApi.setRefreshToken(refresh_token);

        response.send('Success, close this window now');

        setInterval(async () => {
          const data =
            await this.spotifyService.SpotifyWebApi.refreshAccessToken();
          const access_token = data.body['access_token'];
          this.spotifyService.SpotifyWebApi.setAccessToken(access_token);

          console.log('token was refreshed!');
        }, (expires_in / 2) * 1000);
      })
      .catch((error) => {
        console.log('Error getting tokens', error);
        response.send(`Error getting tokens: ${error}`);
      });
  }
}