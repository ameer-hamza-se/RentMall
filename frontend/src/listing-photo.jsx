import { useEffect, useRef } from 'react';

export function UploadedPhoto({ file, alt = '', ...props }) {
  const image = useRef(null);

  useEffect(() => {
    const node = image.current;
    const url = URL.createObjectURL(file);
    node.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <img ref={image} alt={alt} {...props} />;
}

export function ListingPhoto({ item, index = 0, loading = 'lazy' }) {
  if (item.photos?.[index] instanceof Blob) return <UploadedPhoto file={item.photos[index]} className="listing-photo" />;
  const origin = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  const source = item.imageCount > index ? origin + '/api/v1/listings/' + encodeURIComponent(item.slug) + '/photos/' + index : item.photoUrl;
  if (source) return <img className="listing-photo" src={source} alt="" loading={loading} decoding="async" />;
  return <div className="listing-photo photo-empty">No photo added</div>;
}
