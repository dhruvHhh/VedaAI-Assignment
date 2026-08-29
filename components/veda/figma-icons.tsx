import type { SVGProps } from "react";

/**
 * Icons exported from Figma, inlined as components.
 *
 * Pattern for adding a new one — follow it rather than rendering the .svg
 * through next/image:
 *
 *   1. Paste the exported markup into a component here. The .svg itself does
 *      not stay in public/ — once inlined the component is the source of
 *      truth, and an unreferenced copy would just ship in the build.
 *   2. Replace the hardcoded colour with `currentColor`. Figma exports these
 *      two ways, so check which one the icon uses:
 *        - filled icons:  fill="#5E5E5E"   -> fill="currentColor"
 *        - outline icons: stroke="#5E5E5E" -> stroke="currentColor"
 *      An icon can also mix colours across paths (Exams ships #303030 on one
 *      path and "black" on another); every one of them becomes currentColor.
 *   3. DELETE any `fill-opacity` / `stroke-opacity`. The theme's text colours
 *      already carry their own alpha — the inactive nav colour is
 *      rgba(94,94,94,0.8) — so leaving the opacity in multiplies the two and
 *      the icon never reaches full strength on the active row.
 *   4. Rename attributes to JSX casing: fill-rule -> fillRule, clip-rule ->
 *      clipRule, stroke-width -> strokeWidth, stroke-linecap -> strokeLinecap,
 *      stroke-linejoin -> strokeLinejoin.
 *   5. Take `className` so the caller controls size, and keep the original
 *      `viewBox` so a non-square icon letterboxes instead of stretching.
 *
 * The payoff is these behave exactly like the lucide icons around them:
 * `currentColor` inherits the parent's text colour, so an icon darkens on the
 * active row and dims on the inactive ones with no extra wiring. An <img> can't
 * be recoloured by CSS, which is why next/image is the wrong tool here.
 *
 * The exception is a full-colour mark like public/DPS.svg — a school crest that
 * should keep its own colours, and which Figma exports as a base64 raster
 * wrapped in an SVG pattern. That one stays an <Image>; inlining 160KB of
 * base64 would land in the JS bundle for no benefit.
 */

/* -------------------------------------------------------------------------
 * Sidebar navigation, in the order the items appear in the rail.
 * ------------------------------------------------------------------------- */

/** "Home". */
export function HomeIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.5 11.6667H11.6666V17.5H17.5V11.6667Z" />
        <path d="M8.33333 11.6667H2.5V17.5H8.33333V11.6667Z" />
        <path d="M17.5 2.5H11.6666V8.33333H17.5V2.5Z" />
        <path d="M8.33333 2.5H2.5V8.33333H8.33333V2.5Z" />
      </g>
    </svg>
  );
}

/** "My Classroom". */
export function MyClassroomIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.0053 0C19.1069 0 20 0.867353 20 1.93727V12.0627C20 12.8063 19.5687 13.452 18.9357 13.7767C18.7114 13.0842 18.552 12.599 18.4574 12.321C18.403 12.1608 18.3777 12.011 18.2979 11.8819C18.2236 11.7617 18.1006 11.6182 17.9791 11.4747L17.9521 11.4428C17.5516 10.968 17.0414 10.3553 16.609 9.82839C16.1946 9.32331 15.8524 8.89639 15.7181 8.78227C15.3989 8.51105 14.9468 8.21401 14.2686 8.21401H9.66755C9.62487 8.2067 9.53035 8.1911 9.41489 8.14943C8.91888 7.97045 7.88479 7.51948 7.36702 7.30995C6.21465 6.13586 5.35029 5.25332 4.77394 4.66235C4.72638 4.61361 4.61117 4.49397 4.42827 4.30347C4.20391 4.06978 3.83109 4.04594 3.57713 4.24907C3.32508 4.45067 3.28322 4.81013 3.48253 5.06133C5.29064 7.33994 6.21755 8.50276 6.2633 8.5498C6.37468 8.66433 6.70673 8.87699 7.11436 9.1439C7.53415 9.41875 8.03354 9.75 8.41755 10.0092C8.77511 10.2505 8.97606 10.3192 9.01596 10.655C9.10394 11.3955 9.21032 12.5105 9.33511 14H1.99468C0.893058 14 0 13.1326 0 12.0627V1.93727C0 0.867353 0.893058 0 1.99468 0H18.0053ZM15.7979 11.7915C15.9066 11.7819 16.0276 11.915 16.0771 11.9594C16.2486 12.1131 16.3003 12.1721 16.4096 12.2694C16.5691 12.4114 16.7331 12.5764 16.7553 12.6051C16.9727 12.99 17.2919 13.7639 17.4073 14L15.4654 14C15.5489 13.0617 15.6021 12.459 15.625 12.1919C15.6516 11.8819 15.6891 11.8011 15.7979 11.7915ZM12.4734 3.06088C11.1955 3.06088 10.1596 4.06699 10.1596 5.30811C10.1596 6.54922 11.1955 7.55534 12.4734 7.55534C13.7513 7.55534 14.7872 6.54922 14.7872 5.30811C14.7872 4.06699 13.7513 3.06088 12.4734 3.06088Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * "Assignments".
 *
 * Only the three short rule paths carry strokeLinecap="round" in the export;
 * the two outline paths do not, so the cap is set per-path rather than on the
 * shared <g>.
 */
export function AssignmentsIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <g stroke="currentColor" strokeWidth={2}>
        <path d="M7.5 14.1667H12.5" strokeLinecap="round" />
        <path d="M7.5 10.8333H12.5" strokeLinecap="round" />
        <path d="M7.5 7.5H8.33333" strokeLinecap="round" />
        <path d="M4.16663 5C4.16663 3.61929 5.28591 2.5 6.66663 2.5H10.9763C11.4183 2.5 11.8422 2.67559 12.1548 2.98816L15.3451 6.17851C15.6577 6.49107 15.8333 6.915 15.8333 7.35702V15C15.8333 16.3807 14.714 17.5 13.3333 17.5H6.66663C5.28591 17.5 4.16663 16.3807 4.16663 15V5Z" />
        <path d="M10.8334 2.5V4.16667C10.8334 6.00762 12.3258 7.5 14.1667 7.5H15.8334" />
      </g>
    </svg>
  );
}

/** "Exams" — also used for the section label in the top bar. */
export function ExamsIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13.3334 3.33334H15C15.4421 3.33334 15.866 3.50894 16.1786 3.8215C16.4911 4.13406 16.6667 4.55798 16.6667 5.00001V16.6667C16.6667 17.1087 16.4911 17.5326 16.1786 17.8452C15.866 18.1577 15.4421 18.3333 15 18.3333H5.00004C4.55801 18.3333 4.13409 18.1577 3.82153 17.8452C3.50897 17.5326 3.33337 17.1087 3.33337 16.6667V5.00001C3.33337 4.55798 3.50897 4.13406 3.82153 3.8215C4.13409 3.50894 4.55801 3.33334 5.00004 3.33334H6.66671" />
        <path d="M12.5 1.66666H7.49996C7.03972 1.66666 6.66663 2.03975 6.66663 2.49999V4.16666C6.66663 4.62689 7.03972 4.99999 7.49996 4.99999H12.5C12.9602 4.99999 13.3333 4.62689 13.3333 4.16666V2.49999C13.3333 2.03975 12.9602 1.66666 12.5 1.66666Z" />
      </g>
    </svg>
  );
}

/** "My Library". */
export function MyLibraryIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.6751 13.2417C17.1449 14.4954 16.3157 15.6002 15.2599 16.4594C14.2042 17.3187 12.954 17.9062 11.6187 18.1707C10.2835 18.4351 8.90374 18.3685 7.60017 17.9765C6.29661 17.5845 5.10891 16.8792 4.1409 15.9222C3.1729 14.9652 2.45406 13.7856 2.04725 12.4866C1.64043 11.1876 1.55802 9.80874 1.80722 8.47053C2.05641 7.13232 2.62963 5.87553 3.47676 4.81003C4.32388 3.74453 5.41912 2.90277 6.66672 2.35834" />
        <path d="M18.3333 9.99999C18.3333 8.90564 18.1178 7.82201 17.699 6.81096C17.2802 5.79991 16.6664 4.88125 15.8926 4.10743C15.1187 3.33361 14.2001 2.71978 13.189 2.30099C12.178 1.8822 11.0943 1.66666 10 1.66666V9.99999H18.3333Z" />
      </g>
    </svg>
  );
}

/** "Settings". */
export function SettingsIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <g fill="currentColor" fillRule="evenodd" clipRule="evenodd">
        <path d="M9.99996 8.33335C9.07948 8.33335 8.33329 9.07955 8.33329 10C8.33329 10.9205 9.07948 11.6667 9.99996 11.6667C10.9204 11.6667 11.6666 10.9205 11.6666 10C11.6666 9.07955 10.9204 8.33335 9.99996 8.33335ZM6.66663 10C6.66663 8.15907 8.15901 6.66669 9.99996 6.66669C11.8409 6.66669 13.3333 8.15907 13.3333 10C13.3333 11.841 11.8409 13.3334 9.99996 13.3334C8.15901 13.3334 6.66663 11.841 6.66663 10Z" />
        <path d="M7.27475 3.78422C7.27475 2.61474 8.2228 1.66669 9.39228 1.66669H10.6078C11.7773 1.66669 12.7254 2.61474 12.7254 3.78422C12.7254 3.9537 12.8422 4.17983 13.1216 4.33153C13.2075 4.37822 13.2923 4.42676 13.3758 4.47712C13.6544 4.64507 13.916 4.63429 14.0695 4.54643C15.0894 3.96291 16.389 4.31112 16.9804 5.32637L17.5674 6.33399C18.16 7.35118 17.8103 8.6564 16.7885 9.24104C16.6404 9.3258 16.5011 9.54139 16.5079 9.86221C16.5088 9.90804 16.5093 9.95398 16.5093 10C16.5093 10.0461 16.5088 10.092 16.5079 10.1379C16.5011 10.4587 16.6404 10.6743 16.7885 10.759C17.8103 11.3436 18.16 12.6488 17.5674 13.666L16.9804 14.6737C16.3889 15.6889 15.0893 16.0371 14.0695 15.4536C13.916 15.3658 13.6544 15.355 13.3758 15.5229C13.2923 15.5733 13.2075 15.6218 13.1216 15.6685C12.8422 15.8202 12.7254 16.0463 12.7254 16.2158C12.7254 17.3853 11.7773 18.3334 10.6078 18.3334H9.39228C8.2228 18.3334 7.27475 17.3853 7.27475 16.2158C7.27475 16.0463 7.15787 15.8202 6.87854 15.6685C6.79258 15.6218 6.7078 15.5733 6.62427 15.5229C6.34568 15.355 6.08416 15.3658 5.93061 15.4536C4.91078 16.0371 3.61121 15.6889 3.01975 14.6737L2.43272 13.666C1.84013 12.6488 2.18984 11.3436 3.21162 10.759C3.35976 10.6742 3.49905 10.4587 3.49226 10.1379C3.49129 10.092 3.4908 10.0461 3.4908 10C3.4908 9.95398 3.49129 9.90805 3.49226 9.86222C3.49904 9.5414 3.35975 9.32581 3.21161 9.24105C2.18982 8.65641 1.8401 7.35119 2.43269 6.33399L3.01971 5.32637C3.61117 4.31113 4.91075 3.96292 5.93058 4.54644C6.08414 4.6343 6.34567 4.64507 6.62426 4.47713C6.7078 4.42677 6.79257 4.37822 6.87853 4.33153C7.15787 4.17983 7.27475 3.9537 7.27475 3.78422ZM9.39228 3.33335C9.14328 3.33335 8.94142 3.53521 8.94142 3.78422C8.94142 4.70592 8.35352 5.42707 7.67396 5.79614C7.61 5.83088 7.54691 5.86701 7.48473 5.90449C6.82184 6.30411 5.9035 6.45114 5.10287 5.99305C4.87757 5.86414 4.59048 5.94106 4.45981 6.16535L3.8728 7.17297C3.74611 7.39042 3.82088 7.66945 4.03931 7.79444C4.84124 8.25328 5.17491 9.12392 5.15855 9.89746C5.15783 9.93155 5.15747 9.96573 5.15747 10C5.15747 10.0343 5.15783 10.0685 5.15855 10.1026C5.17492 10.8761 4.84125 11.7468 4.03933 12.2056C3.8209 12.3306 3.74614 12.6096 3.87282 12.8271L4.45986 13.8347C4.59052 14.059 4.87761 14.1359 5.1029 14.007C5.90351 13.5489 6.82185 13.6959 7.48473 14.0955C7.54691 14.133 7.61 14.1692 7.67396 14.2039C8.35352 14.573 8.94142 15.2941 8.94142 16.2158C8.94142 16.4648 9.14328 16.6667 9.39228 16.6667H10.6078C10.8568 16.6667 11.0587 16.4648 11.0587 16.2158C11.0587 15.2941 11.6466 14.573 12.3262 14.2039C12.3901 14.1692 12.4532 14.133 12.5154 14.0956C13.1783 13.6959 14.0966 13.5489 14.8972 14.007C15.1225 14.1359 15.4096 14.059 15.5403 13.8347L16.1273 12.8271C16.254 12.6096 16.1792 12.3306 15.9608 12.2056C15.1589 11.7468 14.8252 10.8761 14.8416 10.1026C14.8423 10.0685 14.8427 10.0343 14.8427 10C14.8427 9.96573 14.8423 9.93154 14.8416 9.89745C14.8252 9.12391 15.1589 8.25327 15.9608 7.79443C16.1792 7.66945 16.254 7.39042 16.1273 7.17296L15.5403 6.16534C15.4096 5.94106 15.1225 5.86413 14.8972 5.99304C14.0966 6.45113 13.1783 6.3041 12.5154 5.90449C12.4532 5.86701 12.3901 5.83088 12.3262 5.79614C11.6466 5.42707 11.0587 4.70592 11.0587 3.78422C11.0587 3.53521 10.8568 3.33335 10.6078 3.33335H9.39228Z" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * AI marks. The pair carries the product identity — the expanded sidebar pill
 * and the collapsed rail's round button both use it. The single spark is the
 * lighter-weight mark, used for the top bar's "Ask AI" action.
 * ------------------------------------------------------------------------- */

/**
 * The twin-sparkle lockup for "AI Teacher's Toolkit", beside the label on the
 * expanded pill and alone in the collapsed rail's button.
 *
 * Exported white; currentColor picks up the white text of both so it stays
 * correct if either ever changes. The 19x18 viewBox is not square — size it
 * per-axis (`h-[18px] w-[19px]`) rather than with `size-*`, which squashes it.
 */
export function AiSparkPairIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 19 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <g fill="currentColor" fillRule="evenodd" clipRule="evenodd">
        <path d="M4.63783 8.63783L6.18377 4H7.13246L8.6784 8.63783L13.3162 10.1838V11.1325L8.6784 12.6784L7.13246 17.3162H6.18377L4.63783 12.6784L0 11.1325V10.1838L4.63783 8.63783Z" />
        <path d="M13.3878 2.38783L14.1838 0H15.1325L15.9284 2.38783L18.3162 3.18377V4.13246L15.9284 4.9284L15.1325 7.31623H14.1838L13.3878 4.9284L11 4.13246V3.18377L13.3878 2.38783Z" />
      </g>
    </svg>
  );
}

/**
 * The single spark, used in the top bar's "Ask AI" button.
 *
 * The export wraps the path in a <filter> inner shadow (a 2px white glow at 40%
 * alpha). It is dropped here: filter ids are document-global, so an inlined one
 * collides if the component ever renders twice, and the effect is not visible at
 * 20px anyway.
 */
export function AiSparkIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 21 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.54441 8.66039C6.78395 7.91387 8.54132 6.15651 9.28783 3.91697L10.0344 1.67725L10.625 0L11.2203 1.67725L11.9668 3.91697C12.7133 6.15651 14.4707 7.91387 16.7102 8.66039L18.95 9.40696L20.625 10L18.95 10.5928L16.7102 11.3394C14.4707 12.0859 12.7133 13.8433 11.9668 16.0828L11.2203 18.3225L10.625 20L10.0344 18.3225L9.28783 16.0828C8.54132 13.8433 6.78395 12.0859 4.54441 11.3394L2.30469 10.5928L0 10L2.30469 9.40696L4.54441 8.66039Z"
        fill="currentColor"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * Top bar (components/veda/top-bar.tsx) — the desktop bar and the phone
 * header it swaps to below lg. MenuIcon belongs to the phone header only.
 * ------------------------------------------------------------------------- */

/**
 * Help. A ring plus glyph in one path set, so it needs no bordered wrapper of
 * its own.
 */
export function QuestionMarkIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <rect x="1" y="1" width="22" height="22" rx="11" stroke="currentColor" strokeWidth={2} />
      <path
        d="M10.6108 13.5934C10.6108 11.5706 11.1694 10.7037 12.1712 9.85609L12.6528 9.43228C13.25 8.95067 13.6353 8.43053 13.6353 7.62143C13.6353 6.5041 12.9032 5.71427 11.8822 5.71427C10.7649 5.71427 9.9558 6.71601 9.898 8.29568L7.35512 7.75628C7.43217 5.13634 9.32007 3.46034 11.9208 3.46034C14.5407 3.46034 16.3901 5.07855 16.3901 7.44806C16.3901 8.9892 15.6773 9.91389 14.6563 10.6845L14.1169 11.0697C13.3078 11.7055 12.961 12.2834 12.961 13.5934H10.6108ZM11.8244 17.8123C10.8997 17.8123 10.2448 17.1765 10.2448 16.2711C10.2448 15.385 10.8997 14.7492 11.8244 14.7492C12.7299 14.7492 13.3848 15.385 13.3848 16.2711C13.3848 17.1765 12.7299 17.8123 11.8244 17.8123Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Notifications.
 *
 * The only multi-colour icon here, and the only one that is a whole control
 * rather than a glyph: the export includes the 36px button background and the
 * orange unread badge alongside the bell. So it is NOT converted to
 * currentColor — the three colours are mapped to their theme tokens instead,
 * and the caller supplies no background of its own.
 */
export function NotificationIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <rect width="36" height="36" rx="18" fill="var(--veda-offwhite-primary)" />
      <g
        stroke="var(--veda-text-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M24 14C24 12.4087 23.3679 10.8826 22.2426 9.75736C21.1174 8.63214 19.5913 8 18 8C16.4087 8 14.8826 8.63214 13.7574 9.75736C12.6321 10.8826 12 12.4087 12 14C12 21 9 23 9 23H27C27 23 24 21 24 14Z" />
        <path d="M19.73 27C19.5542 27.3031 19.3019 27.5547 18.9982 27.7295C18.6946 27.9044 18.3504 27.9965 18 27.9965C17.6496 27.9965 17.3054 27.9044 17.0018 27.7295C16.6982 27.5547 16.4458 27.3031 16.27 27" />
      </g>
      <circle cx="31" cy="5" r="4" fill="var(--veda-orange)" />
    </svg>
  );
}

/**
 * The phone header's menu button.
 *
 * A filled glyph, not a stroked one: the export draws each of the three bars as
 * a closed rectangle in a single path (`M3 18V16H21V18H3Z...`), so the bar
 * weight comes from the geometry and does not scale with strokeWidth. Sizing it
 * with a `size-*` class is therefore enough — there is no stroke to keep in
 * step, unlike the lucide icon it replaces.
 */
export function MenuIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        d="M3 18V16H21V18H3ZM3 13V11H21V13H3ZM3 8V6H21V8H3Z"
        fill="currentColor"
      />
    </svg>
  );
}
