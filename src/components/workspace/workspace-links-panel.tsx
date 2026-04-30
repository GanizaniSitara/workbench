import { useState } from "react";

const LINK_GROUPS: Array<{
  heading: string;
  links: Array<{ label: string; url: string }>;
}> = [
  {
    heading: "Markets",
    links: [
      { label: "Bloomberg", url: "https://www.bloomberg.com" },
      { label: "FT", url: "https://www.ft.com" },
      { label: "Reuters", url: "https://www.reuters.com" },
      { label: "WSJ", url: "https://www.wsj.com" },
    ],
  },
  {
    heading: "Data",
    links: [
      { label: "FRED", url: "https://fred.stlouisfed.org" },
      { label: "Trading Econ", url: "https://tradingeconomics.com" },
      { label: "Investing.com", url: "https://www.investing.com" },
      { label: "Yahoo Finance", url: "https://finance.yahoo.com" },
    ],
  },
  {
    heading: "Fixed Income",
    links: [
      { label: "DMO", url: "https://www.dmo.gov.uk" },
      { label: "BoE", url: "https://www.bankofengland.co.uk" },
      { label: "ECB", url: "https://www.ecb.europa.eu" },
      { label: "Fed", url: "https://www.federalreserve.gov" },
    ],
  },
];

export function WorkspaceLinksPanel() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`workspace-links-panel${collapsed ? " workspace-links-panel--collapsed" : ""}`}>
      <button
        className="workspace-links-panel__header"
        onClick={() => setCollapsed((c) => !c)}
        type="button"
      >
        <span>Links</span>
        <span className={`workspace-links-panel__chevron${collapsed ? "" : " workspace-links-panel__chevron--open"}`}>
          ›
        </span>
      </button>
      {!collapsed && (
        <div className="workspace-links-panel__body">
          {LINK_GROUPS.map((group) => (
            <div className="workspace-links-panel__group" key={group.heading}>
              <div className="workspace-links-panel__group-heading">
                {group.heading}
              </div>
              {group.links.map((link) => (
                <a
                  className="workspace-links-panel__link"
                  href={link.url}
                  key={link.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
