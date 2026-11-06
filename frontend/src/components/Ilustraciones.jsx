export function Llama({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M17 1c3 11-4 12 2 19 2-4 4-6 5-8 12 16 6 27-9 27S-5 23 8 12c-1 8 2 9 3 10C7 11 17 9 17 1Z"
        fill="currentColor"
      />
      <path d="M16 22c6 7 7 12 0 14-7-2-5-7 0-14Z" fill="white" />
    </svg>
  );
}
export function Balon({ peso = 15, accesorio = false, className = '' }) {
  return (
    <svg
      className={`ilustracion ${className}`}
      viewBox="0 0 220 220"
      role="img"
      aria-label={
        accesorio
          ? 'Ilustración de accesorio de gas'
          : `Balón de gas de ${peso} kg`
      }
    >
      <ellipse cx="110" cy="199" rx="65" ry="8" fill="#0B3D91" opacity=".08" />
      {accesorio ? (
        <g>
          <path
            d="M45 155c0-70 120-90 125-15s-95 70-95 12 60-65 64-22"
            fill="none"
            stroke="#0B3D91"
            strokeWidth="15"
          />
          <rect x="116" y="53" width="40" height="40" rx="8" fill="#FF6B1A" />
          <rect x="127" y="40" width="18" height="19" rx="4" fill="#0B3D91" />
          <circle cx="136" cy="72" r="10" fill="white" />
        </g>
      ) : (
        <g>
          <path
            d="M85 49V27h50v22"
            fill="none"
            stroke="#0B3D91"
            strokeWidth="12"
            strokeLinejoin="round"
          />
          <rect x="99" y="35" width="22" height="22" rx="4" fill="#FF6B1A" />
          <rect x="58" y="52" width="104" height="137" rx="30" fill="#0B3D91" />
          <path
            d="M69 75v78"
            stroke="white"
            strokeOpacity=".14"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <rect x="56" y="173" width="108" height="18" rx="6" fill="#082C68" />
          <rect x="58" y="100" width="104" height="51" fill="#FF6B1A" />
          <text
            x="110"
            y="132"
            fill="white"
            textAnchor="middle"
            fontFamily="sans-serif"
            fontSize="25"
            fontWeight="700"
          >
            {peso} kg
          </text>
          <path
            d="M100 79h20"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}
