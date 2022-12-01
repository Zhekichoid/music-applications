import { useNavigate } from 'react-router-dom';
import { ArtistTrackName } from './page-utils';
import { AlbumTrackInfo } from './page-utils';

const AlbumInfo = ({ album }) => {
  const router = useNavigate();
  const trackNameClickCallback = (spotify_id) => router(`/track/${spotify_id}`);
  const artistNameClickCallback = (spotify_id) =>
    router(`/artist/${spotify_id}`);

  return (
    <div className="item-page-content">
      <div>
        <div className="album-item-page-details-header">
          <div className="album-item-page-images">
            <img
              src={album.images[1].url}
              height={album.images[1].height}
              width={album.images[1].width}
              alt="album-cover"
            ></img>
          </div>
          <div className="album-item-page-title">
            <div className="album-type-text">
              <div>{album.album_type.toUpperCase()}</div>
            </div>
            <div className="album-label-text">
              <div>{album.label}</div>
            </div>
            <div className="album-info-text">
              {album.artist.map((artist, index) => (
                <ArtistTrackName
                  artist={artist}
                  onArtistClickCallback={artistNameClickCallback}
                  key={index}
                ></ArtistTrackName>
              ))}
              {/* <div>{album.artist.map((artist) => artist.label).join(', ')}</div> */}
              <div className="symbol">&#9679;</div>
              <div>{album.release_date.slice(0, 4)}</div>
              <div className="symbol">&#9679;</div>
              <div>{album.tracks_num} tracks</div>
            </div>
          </div>
        </div>
        <div>
          <div className="featured-tracks-label">Featured tracks:</div>{' '}
          {album.tracks.map((track, index) => {
            return (
              <AlbumTrackInfo
                track={track}
                key={index}
                onTrackClickCallback={trackNameClickCallback}
              />
            );
          })}
        </div>
        <div className="album-item-page-details-textbox">
          <div>Album label: {album.actual_label}</div>
          <div>Album was released at {album.release_date}</div>
        </div>
      </div>
    </div>
  );
};



export default AlbumInfo;
