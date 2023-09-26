import { useContext, useEffect, useState } from 'react';
import GraphViewPage from './graph-view';
import './style.scss';
import { Neo4jDbItem } from '../../../types';
import RelationViewPage from './relation';
import { ReactComponent as FilledHeart } from '../../../../assets/filled-heart.svg';
import { ReactComponent as Heart } from '../../../../assets/heart.svg';
import { UserContext } from '../../../contexts/user.context';
import {
  checkIfLiked,
  dropLike,
  fetchDatabaseItem,
  pressLike,
} from '../../../requests';
import { useNavigate, useParams } from 'react-router-dom';
import { RecentlyViewedContext } from '../../../contexts/recently-viewed.context';

const DatabaseItemPage = () => {
  // default view is relation view
  const params = useParams();
  const router = useNavigate();
  const [item, setItem] = useState<Neo4jDbItem>();
  const [isRelationViewSelected, setIsRelationViewSelected] = useState(true);
  const [isLiked, setIsLiked] = useState<boolean | null>(null);
  const { currentUser } = useContext(UserContext);
  const { addItem } = useContext(RecentlyViewedContext);

  // extract to different file later
  const handleLikeChanges = async (newState: boolean) => {
    if (currentUser && item) {
      if (newState) {
        await pressLike(item.properties.id, currentUser.accessToken);
      } else {
        await dropLike(item.properties.id, currentUser.accessToken);
      }
      // after awaiting
      setIsLiked(newState);
    }
  };

  const routingCallback = (type: string, id: number) =>
    router(`/db/${type}/${id}`);

  useEffect(() => {
    const asyncWrapper = async () => {
      if ((params['id'], params['type'])) {
        const fetchedItem = await fetchDatabaseItem(
          params['id'] as unknown as number,
          params['type']
        );
        console.log(fetchedItem);
        if (fetchedItem) {
          setItem(fetchedItem);
          // TODO: GENERATE IMAGES FOR GENRE
          addItem({
            type: fetchedItem.type,
            label: fetchedItem.name,
            databaseId: fetchedItem.id,
            // image: fetchedItem.properties.image_url
          });
        }
      }
    };

    asyncWrapper();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params['id'], params['type']]);

  useEffect(() => {
    const asyncWrapper = async () => {
      if (currentUser && item) {
        if (currentUser) {
          const result = await checkIfLiked(
            item.properties.id,
            currentUser.accessToken
          );

          setIsLiked(result);
        } else {
          setIsLiked(null);
        }
      }
    };

    asyncWrapper();
  }, [currentUser, item]);

  return (
    <div className="database-item-page-wrapper">
      <div className="database-item-page-sidebar-menu">
        <div
          className="database-item-page-menu"
          onClick={() => setIsRelationViewSelected(true)}
        >
          Relation view
        </div>
        <div
          className="database-item-page-menu"
          onClick={() => setIsRelationViewSelected(false)}
        >
          Graph view
        </div>
        {isLiked !== null && (
          <div className="like-container">
            {isLiked !== null && isLiked ? (
              <FilledHeart
                className="heart-icon"
                onClick={() => handleLikeChanges(!isLiked)}
              ></FilledHeart>
            ) : (
              <Heart
                className="heart-icon"
                onClick={() => handleLikeChanges(!isLiked)}
              ></Heart>
            )}
          </div>
        )}
      </div>
      {item && (
        <div className="database-item-page-content">
          {isRelationViewSelected ? (
            <RelationViewPage
              item={item}
              routingCallback={routingCallback}
            ></RelationViewPage>
          ) : (
            // <RelationViewPage item={item}></RelationViewPage>
            <GraphViewPage item={item}></GraphViewPage>
          )}
        </div>
      )}
    </div>
  );
};

export default DatabaseItemPage;
