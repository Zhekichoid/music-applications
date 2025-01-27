import { Injectable } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j/dist';
import { SpotifyService } from './spotify.service';

@Injectable()
export class DatabaseManager {
  constructor(
    private readonly dbService: Neo4jService,
    private readonly spotifyService: SpotifyService
  ) {}

  // need to add search playlist function
  // need some serious refactoring
  private searchArtistQuery = (artistName: string) =>
    `MATCH (obj: Artist) WHERE ToLower(obj.name) CONTAINS "${artistName}" return obj`;

  private searchAlbumQuery = (albumTitle: string) =>
    `MATCH (obj: Album) WHERE ToLower(obj.name) CONTAINS "${albumTitle}" return obj`;

  private searchGenreQuery = (genreKind: string) =>
    `MATCH (obj: Genre) WHERE ToLower(obj.name) CONTAINS "${genreKind}" return obj`;

  private searchTrackQuery = (songTitle: string) =>
    `MATCH (obj: Track) WHERE ToLower(obj.name) CONTAINS "${songTitle}" return obj`;

  private searchPlaylistQuery = (playlistName: string) =>
    `MATCH (obj: Playlist) WHERE ToLower(obj.name) CONTAINS "${playlistName}" return obj`;

  public findNodeAndRelationsWithId = async (id: number, type: string) => {
    const res = await this.dbService.read(
      `MATCH (obj: ${type} { id: "${id}" })-[rel]-(o_obj) return obj, rel, o_obj`
    );

    return res.records;
  };

  public findNodeBySpotifyId = async (spotify_id: string) => {
    const res = await this.dbService.read(
      `MATCH (instance) WHERE instance.spotify_id = '${spotify_id}' RETURN instance;`
    );
    return res.records;
  };

  private searchFunctions = [
    this.searchArtistQuery,
    this.searchAlbumQuery,
    this.searchGenreQuery,
    this.searchTrackQuery,
    this.searchPlaylistQuery,
  ];

  private collectQuery(instance: string, query: string): string {
    switch (instance) {
      case 'all':
        return this.searchFunctions.map((func) => func(query)).join(' UNION ');
      case 'artist':
        return this.searchArtistQuery(query);
      case 'track':
        return this.searchTrackQuery(query);
      case 'album':
        return this.searchAlbumQuery(query);
      case 'genre':
        return this.searchGenreQuery(query);
      case 'playlist':
        return this.searchPlaylistQuery(query);
    }
  }

  private unwrapQuery(query) {
    return Object.keys(query).map((key) => {
      return [key.toString(), query[key].toString()];
    });
  }

  public async getData(query) {
    const [params] = this.unwrapQuery(query);
    const result = await this.dbService.read(
      this.collectQuery(params[0], params[1])
    );
    return result;
  }

  public async getDbStats() {
    // WARNING: part of following query is deprecated and will be removed in future
    const result = await this.dbService.read(
      `match (n) return count(n) as countOfNodes, sum ( size( (n)-[]->())) as counfOfRelationShip`
    );

    return result;
  }

  public async getUserDbStats(username: string) {
    const result = await this.dbService.read(
      `match (n) where n.added_by = "${username}" return count(n) as countOfNodes, sum ( size( (n)-[]->())) as counfOfRelationShip`
    );

    const values = result.records[0]['_fields'].map(
      (obj: { low: number }) => obj.low
    );

    return values;
  }

  /*
     list of instances: artist, track, album, playlist, genre
     list of relations:
        :author between artist and track(or album)
        :appeared between secondary artist and track(or album) <- fits for sub instances
        :performsIn between artist and genre
        :contains between album or playlist and track

     algorithm for adding instances:
      1. Check whether instance is already existing in db.
      2. Check existence of all sub instances.
      3. Create instance if needed.
      4. Create sub instances {also get them from spotify by id, if necessary}.
      5. Provide relations.
  */

  public async isThereInstanceWithId(id: string) {
    const query = await this.dbService.read(
      `MATCH (instance) WHERE instance.spotify_id = "${id}" RETURN instance`
    );

    return query.records.length != 0;
  }

  public async generateNewNodeId(): Promise<number> {
    const query = await this.dbService.write(`MERGE (id:GlobalUniqueId)
      ON CREATE SET id.count = 1
      ON MATCH SET id.count = id.count + 1
      RETURN id.count AS generated_id`);

    const [recordId] = query.records;
    return recordId.get('generated_id')['low'];
  }

  public async addGenre(genreName: string, username: string) {
    const checkQuery = await this.dbService.read(
      `MATCH (genre: Genre) WHERE genre.name = "${genreName}" RETURN genre`
    );

    const nodeId = await this.generateNewNodeId();
    if (checkQuery.records.length === 0) {
      await this.dbService.write(
        `CREATE (genre: Genre {
          name: "${genreName}",
          added_by: "${username}",
          id: "${nodeId}"
        })`
      );

      return true;
    }

    return false;
  }

  public async addAlbum(spotify_id: string, username: string) {
    const alreadyExists = await this.isThereInstanceWithId(spotify_id);

    if (!alreadyExists) {
      const album = await this.spotifyService.getAlbumById(spotify_id);

      const nodeId = await this.generateNewNodeId();
      await this.dbService.write(`
        CREATE (album: Album {
          name: "${album.name}",
          spotify_id: "${album.id}",
          type: "${album.album_type}",
          count_of_tracks: "${album.total_tracks}",
          label: "${album.label}",
          release: "${album.release_date}",
          added_by: "${username}",
          id: "${nodeId}"
        })`);

      for (const genre of album.genres) {
        // create genre if possible
        await this.addGenre(genre, username);
        await this.dbService.write(`
          MATCH
            (album: Album {spotify_id: "${spotify_id}"}),
            (genre: Genre {name: "${genre}"})
          MERGE (album)-[r:RelatedToGenre]->(genre)
          RETURN type(r)`);
      }

      for (const artist of album.artists) {
        await this.addArtist(artist.id, username);
      }

      const albumAuthor = album.artists.shift();
      await this.dbService.write(`
        MATCH
          (artist: Artist {spotify_id: "${albumAuthor.id}"}),
          (album: Album {spotify_id: "${spotify_id}"})
        MERGE (artist)-[r:Author]->(album)
        RETURN type(r)`);

      for (const artist of album.artists) {
        await this.dbService.write(`
          MATCH
            (artist: Artist {spotify_id: "${artist.id}"}),
            (album: Album {spotify_id: "${spotify_id}"})
          MERGE (artist)-[r:AppearedAt]->(album)
          RETURN type(r)`);
      }

      for (const track of album.tracks.items) {
        await this.addTrack(track.id, username);
        await this.dbService.write(`
          MATCH
            (album: Album {spotify_id: "${spotify_id}"}),
            (track: Track {spotify_id: "${track.id}"})
          MERGE (album)-[r:Contains]->(track)
          RETURN type(r)`);
      }

      return true;
    }

    return false;
  }

  public async addArtist(spotify_id: string, username: string) {
    const alreadyExists = await this.isThereInstanceWithId(spotify_id);

    if (!alreadyExists) {
      // create artist
      const artist = await this.spotifyService.getArtistById(spotify_id);
      const nodeId = await this.generateNewNodeId();

      await this.dbService.write(`
        CREATE (artist: Artist {
          name: "${artist.name}",
          spotify_id: "${artist.id}",
          type: "${artist.type}",
          added_by: "${username}",
          id: "${nodeId}"
        })`);

      // sequence
      for (const genre of artist.genres) {
        await this.addGenre(genre, username);
      }

      for (const genre of artist.genres) {
        await this.dbService.write(`
          MATCH
            (artist: Artist {spotify_id: "${artist.id}"}),
            (genre: Genre {name: "${genre}"})
          MERGE (artist)-[r:PerformsInGenre]->(genre)
          RETURN type(r)`);
      }

      return true;
    }

    return false;
  }

  public async addPlaylist(spotify_id: string, username: string) {
    const alreadyExists = await this.isThereInstanceWithId(spotify_id);

    if (!alreadyExists) {
      const playlist = await this.spotifyService.getPlaylistById(spotify_id);
      const nodeId = await this.generateNewNodeId();

      await this.dbService.write(`
        CREATE (playlist: Playlist {
          name: "${playlist.name}",
          description: "${playlist.description}",
          spotify_id: "${playlist.id}",
          owner_name: "${playlist.owner.display_name}",
          collaborative: "${playlist.collaborative}",
          added_by: "${username}",
          id: "${nodeId}"
        })
      `);

      // add tracks
      for (const track of playlist.tracks.items) {
        // if (track.track.id)
        await this.addTrack(track.track.id, username);
        await this.dbService.write(`
          MATCH
            (playlist: Playlist {spotify_id: "${spotify_id}"}),
            (track: Track {spotify_id: "${track.track.id}"})
          MERGE (playlist)-[r:Contains]->(track)
          RETURN type(r)`);
      }

      return true;
    }

    return false;
  }

  public async addTrack(spotify_id: string, username: string) {
    const alreadyExists = await this.isThereInstanceWithId(spotify_id);

    if (!alreadyExists) {
      const track = await this.spotifyService.getTrackById(spotify_id);
      const nodeId = await this.generateNewNodeId();

      // create track at first
      await this.dbService.write(`
        CREATE (track: Track {
          name: "${track.name}",
          duration_ms: "${track.duration_ms}",
          explicit: "${track.explicit}",
          spotify_id: "${track.id}",
          added_by: "${username}",
          id: "${nodeId}"
        })`);

      // relate artists to track
      // first add artists
      for (const artist of track.artists) {
        await this.addArtist(artist.id, username);
      }

      // add author relations
      const trackAuthor = track.artists.shift();
      await this.dbService.write(`
        MATCH
          (artist: Artist {spotify_id: "${trackAuthor.id}"}),
          (track: Track {spotify_id: "${spotify_id}"})
        MERGE (artist)-[r:Author]->(track)
        RETURN type(r)`);

      for (const artist of track.artists) {
        await this.dbService.write(`
          MATCH
            (artist: Artist {spotify_id: "${artist.id}"}),
            (track: Track {spotify_id: "${spotify_id}"})
          MERGE (artist)-[r:AppearedAt]->(track)
          RETURN type(r)`);
      }

      return true;
    }

    return false;
  }
}
