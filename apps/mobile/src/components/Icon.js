import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

export default function Icon({ name, size = 21, color = 'currentColor' }) {
  const strokeProps = {
    fill: 'none',
    stroke: color,
    strokeWidth: '1.7',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  const renderPaths = () => {
    switch (name) {
      case 'home':
        return (
          <>
            <Path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...strokeProps} />
            <Path d="M9 21v-7h6v7" {...strokeProps} />
          </>
        );
      case 'chat':
        return (
          <>
            <Path d="M20 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4z" {...strokeProps} />
            <Path d="M7 10h9M7 14h5" {...strokeProps} />
          </>
        );
      case 'grid':
        return (
          <>
            <Rect x="3" y="3" width="7" height="7" rx="1" {...strokeProps} />
            <Rect x="14" y="3" width="7" height="7" rx="1" {...strokeProps} />
            <Rect x="3" y="14" width="7" height="7" rx="1" {...strokeProps} />
            <Rect x="14" y="14" width="7" height="7" rx="1" {...strokeProps} />
          </>
        );
      case 'settings':
        return (
          <>
            <Circle cx="12" cy="12" r="3" {...strokeProps} />
            <Path
              d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-3v-.1a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.12 15a1.7 1.7 0 0 0-1.55-1H5.5v-3h.1a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V4.5h3v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.55 1h.1v3h-.1a1.7 1.7 0 0 0-1.55 1Z"
              {...strokeProps}
            />
          </>
        );
      case 'bell':
        return (
          <Path
            d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
            {...strokeProps}
          />
        );
      case 'chevron':
        return <Path d="m9 18 6-6-6-6" {...strokeProps} />;
      case 'more':
        return (
          <>
            <Circle cx="5" cy="12" r="1" fill={color} />
            <Circle cx="12" cy="12" r="1" fill={color} />
            <Circle cx="19" cy="12" r="1" fill={color} />
          </>
        );
      case 'terminal':
        return (
          <>
            <Path d="m5 7 4 4-4 4M12 17h7" {...strokeProps} />
            <Rect x="3" y="3" width="18" height="18" rx="3" {...strokeProps} />
          </>
        );
      case 'file':
        return (
          <>
            <Path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" {...strokeProps} />
            <Path d="M14 3v6h6M8 13h8M8 17h5" {...strokeProps} />
          </>
        );
      case 'shield':
        return (
          <>
            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" {...strokeProps} />
            <Path d="m9 12 2 2 4-4" {...strokeProps} />
          </>
        );
      case 'send':
        return (
          <>
            <Path d="m21 3-7 18-4-8-7-4Z" {...strokeProps} />
            <Path d="m10 13 5-5" {...strokeProps} />
          </>
        );
      case 'plus':
        return <Path d="M12 5v14M5 12h14" {...strokeProps} />;
      case 'copy':
        return (
          <>
            <Rect x="8" y="8" width="12" height="12" rx="2" {...strokeProps} />
            <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...strokeProps} />
          </>
        );
      case 'attach':
        return (
          <Path
            d="m20.5 11.5-8.9 8.9a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"
            {...strokeProps}
          />
        );
      case 'arrow':
        return <Path d="M5 12h14M13 6l6 6-6 6" {...strokeProps} />;
      case 'x':
        return <Path d="m6 6 12 12M18 6 6 18" {...strokeProps} />;
      case 'moon':
        return <Path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z" {...strokeProps} />;
      case 'sun':
        return (
          <>
            <Circle cx="12" cy="12" r="4" {...strokeProps} />
            <Path
              d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
              {...strokeProps}
            />
          </>
        );
      case 'monitor':
        return (
          <>
            <Rect x="3" y="4" width="18" height="13" rx="2" {...strokeProps} />
            <Path d="M8 21h8M12 17v4" {...strokeProps} />
          </>
        );
      case 'check':
        return <Path d="m5 12 4 4L19 6" {...strokeProps} />;
      case 'wifi':
        return (
          <>
            <Path d="M5 12.5a10 10 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01" {...strokeProps} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths()}
    </Svg>
  );
}
