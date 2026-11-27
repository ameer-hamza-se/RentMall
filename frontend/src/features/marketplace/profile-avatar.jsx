import { MarketIcon } from './market-icon.jsx';

export function ProfileAvatar({ photo, className }) {
  return (
    <span className={className} aria-hidden="true">
      {photo ? <img className="profile-photo" src={photo} alt="" /> : <MarketIcon name="user" />}
    </span>
  );
}
