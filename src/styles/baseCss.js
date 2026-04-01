// src/styles/baseCss.js
export const baseCss = `
  * { box-sizing: border-box; }
  html, body, #root {
    min-height: 100%;
  }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f3f4f6;
    color: #111827;
  }

  .app {
    min-height: 100vh;
    background: #f3f4f6;
    color: #111827;
  }

  .app-center {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.05rem;
    padding: 24px;
    text-align: center;
  }

  /* Header */
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 16px 32px;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .header-left {
    min-width: 0;
  }
  .header-left h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    line-height: 1.1;
  }
  .header-left .badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.75rem;
    background: #eef2ff;
    color: #4338ca;
  }
  .header-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 0.9rem;
  }
  .user-info {
    white-space: nowrap;
    color: #374151;
    font-size: 0.85rem;
  }

  /* Buttons */
  .btn-primary,
  .btn-secondary,
  .btn-outline,
  .btn-outline-small {
    border-radius: 999px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  }
  .btn-primary,
  .btn-secondary,
  .btn-outline {
    padding: 8px 16px;
    border: none;
  }
  .btn-primary {
    background: #111827;
    color: #ffffff;
  }
  .btn-primary:hover { background: #1f2933; }

  .btn-secondary {
    background: #e5e7eb;
    color: #111827;
  }
  .btn-secondary:hover { background: #d1d5db; }

  .btn-outline {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #111827;
  }
  .btn-outline:hover { background: #f3f4f6; }

  .btn-outline-small {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #111827;
    padding: 5px 10px;
    font-size: 0.8rem;
  }
  .btn-outline-small:hover { background: #f3f4f6; }

  button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  /* Layout */
  .main {
    padding: 24px 32px 40px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .top-bar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .tabs,
  .status-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tab-button,
  .status-button,
  .view-button {
    border-radius: 999px;
    padding: 7px 14px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.85rem;
    cursor: pointer;
    color: #111827;
  }

  .tab-button-active,
  .status-button-active,
  .view-button-active {
    background: #111827;
    color: #ffffff;
    border-color: #111827;
  }

  .filters-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    flex-wrap: wrap;
  }

  select {
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.9rem;
    min-height: 38px;
  }

  .search-box {
    flex: 1;
    min-width: 280px;
    max-width: 520px;
  }
  .search-input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.9rem;
    outline: none;
    min-height: 40px;
  }
  .search-input:focus {
    border-color: #9ca3af;
    box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.06);
  }

  .view-toggle {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .section-title {
    margin: 14px 0 10px;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .dash-page-title {
    margin: 0 0 12px;
    font-size: 1.25rem;
    font-weight: 800;
    color: #111827;
    line-height: 1.2;
  }

  /* Client detail cards */
  .clients-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .client-card {
    background: #ffffff;
    border-radius: 16px;
    padding: 14px 18px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }

  .detail-card-inside {
    margin-top: 10px;
  }

  .client-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 8px;
  }

  .client-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .client-name {
    font-weight: 600;
    font-size: 1rem;
    margin-bottom: 2px;
    line-height: 1.25;
  }

  .client-commercial {
    font-size: 0.85rem;
    color: #4b5563;
    margin-bottom: 2px;
  }

  .client-line {
    font-size: 0.85rem;
    color: #374151;
    line-height: 1.35;
  }

  .client-body {
    font-size: 0.85rem;
    color: #374151;
    margin-bottom: 8px;
  }

  .field-row {
    display: flex;
    gap: 6px;
    margin-bottom: 4px;
    align-items: flex-start;
  }

  .field-key {
    font-weight: 500;
    min-width: 120px;
  }

  .field-value {
    flex: 1;
    word-break: break-word;
    line-height: 1.35;
  }

  .client-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .stage-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
  .stage-badge-premandat {
    background: #eff6ff;
    color: #1d4ed8;
  }
  .stage-badge-mandat {
    background: #ecfdf5;
    color: #047857;
  }

  /* Compact list */
  .compact-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .compact-row {
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    overflow: hidden;
  }

  .compact-row-expanded {
    border-color: #d1d5db;
  }

  .compact-row-click {
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .compact-row-main {
    min-width: 0;
    flex: 1;
  }

  .compact-row-line1 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .compact-name {
    font-weight: 700;
    font-size: 1rem;
    line-height: 1.25;
  }

  .compact-owner {
    color: #6b7280;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .compact-row-line2 {
    color: #374151;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.1px;
    line-height: 1.35;
  }

  .compact-row-right {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 2px;
    flex-shrink: 0;
  }

  .chev {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .compact-expanded {
    padding: 0 12px 12px;
  }

  /* Relance */
  .nextdue-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .nextdue-label {
    font-size: 0.85rem;
    color: #111827;
    font-weight: 600;
  }

  .nextdue-input {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-size: 0.9rem;
    min-height: 38px;
  }

  /* Dashboard */
  .conversion-card {
    margin-top: 16px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 16px 18px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }
  .conversion-card-title {
    font-size: 0.88rem;
    color: #6b7280;
    margin-bottom: 6px;
  }
  .conversion-card-value {
    font-size: 1.9rem;
    font-weight: 800;
    color: #111827;
    line-height: 1.1;
    margin-bottom: 6px;
  }
  .conversion-card-meta {
    font-size: 0.92rem;
    font-weight: 600;
    color: #111827;
    line-height: 1.35;
  }
  .conversion-card-sub {
    font-size: 0.82rem;
    color: #6b7280;
    margin-top: 6px;
    line-height: 1.35;
  }

  .dash-top {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .dash-kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .kpi {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 12px 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }

  .kpi-label {
    font-size: 0.8rem;
    color: #6b7280;
    margin-bottom: 6px;
    line-height: 1.35;
  }

  .kpi-value {
    font-size: 1.3rem;
    font-weight: 700;
    color: #111827;
    line-height: 1.1;
  }

  .dash-score {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 12px 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }

  .dash-score-title {
    font-size: 0.85rem;
    color: #6b7280;
    margin-bottom: 6px;
  }

  .dash-score-value {
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1.1;
  }

  .dash-score-sub {
    font-size: 0.85rem;
    color: #374151;
    margin-top: 6px;
    line-height: 1.4;
  }

  .dash-score-tips {
    margin-top: 10px;
    font-size: 0.85rem;
    color: #374151;
    line-height: 1.4;
  }

  .dash-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .dash-card-head {
    margin-bottom: 8px;
  }

  .dash-card-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }

  .dash-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 14px 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }

  .dash-title {
    font-weight: 700;
    margin-bottom: 10px;
    line-height: 1.35;
  }

  .dash-empty {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .dash-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .dash-item-name {
    font-weight: 700;
    font-size: 0.95rem;
    line-height: 1.35;
  }

  .dash-item-sub {
    color: #6b7280;
    font-size: 0.85rem;
    line-height: 1.35;
  }

  /* Auth cards */
  .auth-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }

  .auth-card {
    background: #ffffff;
    padding: 24px 28px;
    border-radius: 18px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.06);
    max-width: 380px;
    width: 100%;
  }

  .auth-card h1 {
    margin: 0 0 4px;
    font-size: 1.4rem;
    line-height: 1.15;
  }

  .auth-card .badge {
    margin-bottom: 16px;
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 10px 0 6px;
  }

  .auth-form label {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    gap: 4px;
  }

  .auth-form input,
  .auth-form textarea,
  .auth-form select {
    padding: 9px 10px;
    border-radius: 10px;
    border: 1px solid #d1d5db;
    font-size: 0.9rem;
    resize: vertical;
    min-height: 40px;
  }

  .link-button {
    background: none;
    border: none;
    padding: 0;
    color: #2563eb;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .footer-text {
    margin-top: 12px;
    font-size: 0.8rem;
    color: #6b7280;
    text-align: center;
    line-height: 1.4;
  }

  .error-text {
    color: #b91c1c;
    font-size: 0.85rem;
    margin-bottom: 8px;
    line-height: 1.35;
  }

  /* Modals */
  .admin-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15,23,42,0.35);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    z-index: 50;
    padding: 20px 16px;
    overflow-y: auto;
  }

  .admin-modal {
    background: #ffffff;
    padding: 18px 20px;
    border-radius: 18px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    margin: 0 auto;
  }

  .admin-modal-xl {
    max-width: 1120px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
  }

  .admin-modal-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 12px;
  }

  .admin-modal h2 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.2;
  }

  .admin-modal h3 {
    margin-top: 16px;
    margin-bottom: 6px;
    font-size: 0.95rem;
    line-height: 1.3;
  }

  .admin-modal-sub {
    margin: 4px 0 0;
    font-size: 0.88rem;
    color: #6b7280;
    line-height: 1.4;
  }

  .admin-alert {
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 12px;
    font-size: 0.9rem;
    line-height: 1.35;
  }

  .admin-alert-success {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
  }

  .admin-alert-error {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .admin-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 14px;
  }

  .admin-card-users,
  .admin-card-delays {
    grid-column: 1 / span 2;
  }

  .admin-card-title {
    font-weight: 700;
    font-size: 0.98rem;
    margin-bottom: 4px;
    line-height: 1.3;
  }

  .admin-card-sub {
    font-size: 0.84rem;
    color: #6b7280;
    margin-bottom: 12px;
    line-height: 1.4;
  }

  .admin-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .admin-form-grid label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
  }

  .admin-form-grid input,
  .admin-form-grid select {
    width: 100%;
  }

  .admin-actions-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .admin-users-wrap {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .admin-list-title {
    font-size: 0.85rem;
    font-weight: 700;
    margin-bottom: 8px;
    color: #374151;
  }

  .admin-users-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .admin-user-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .admin-user-main {
    min-width: 0;
  }

  .admin-user-email {
    font-weight: 600;
    font-size: 0.9rem;
    word-break: break-word;
    line-height: 1.35;
  }

  .admin-user-meta {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 2px;
    line-height: 1.35;
  }

  .admin-chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .admin-chip-neutral {
    background: #eef2ff;
    color: #4338ca;
  }

  .admin-empty {
    color: #6b7280;
    font-size: 0.85rem;
    padding: 10px 2px;
  }

  .admin-delay-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .admin-delay-box {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 12px;
  }

  .admin-delay-title {
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 10px;
    line-height: 1.3;
  }

  .admin-delay-box label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.84rem;
    margin-bottom: 10px;
  }

  /* Footer */
  .app-footer {
    margin-top: 24px;
    font-size: 0.8rem;
    color: #6b7280;
    text-align: center;
    line-height: 1.4;
  }

  /* Client modal */
  .client-modal-panel {
    max-width: 980px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
  }

  .client-modal-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }

  .client-modal-head h2 {
    margin: 0;
    line-height: 1.2;
  }

  .client-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .client-form-span-2 {
    grid-column: 1 / span 2;
  }

  .client-checkbox-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
  }

  .client-checkbox-row input[type="checkbox"] {
    min-height: auto;
    width: auto;
    margin: 0;
  }

  .client-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  /* Profile bubble / menu */
  .profile-menu-wrap {
    position: relative;
  }

  .profile-bubble {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #111827;
    color: #ffffff;
    font-weight: 700;
    font-size: 0.82rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }

  .profile-bubble:hover {
    background: #1f2933;
  }

  .profile-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    min-width: 230px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.08);
    overflow: hidden;
    z-index: 30;
  }

  .profile-dropdown-head {
    padding: 12px 14px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .profile-dropdown-name {
    font-weight: 700;
    font-size: 0.9rem;
    line-height: 1.3;
  }

  .profile-dropdown-email {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 2px;
    word-break: break-word;
    line-height: 1.35;
  }

  .profile-dropdown-item {
    width: 100%;
    text-align: left;
    border: none;
    background: #ffffff;
    padding: 11px 14px;
    font-size: 0.88rem;
    cursor: pointer;
  }

  .profile-dropdown-item:hover {
    background: #f3f4f6;
  }

  /* Profile modal */
  .profile-modal-panel {
    max-width: 820px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
  }

  .profile-modal-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }

  .profile-modal-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  /* Tablet */
  @media (max-width: 1000px) {
    .main {
      padding: 20px 20px 32px;
    }

    .dash-top {
      grid-template-columns: 1fr;
    }

    .dash-kpis {
      grid-template-columns: repeat(2, 1fr);
    }

    .dash-grid {
      grid-template-columns: 1fr;
    }

    .admin-grid {
      grid-template-columns: 1fr;
    }

    .admin-card-users,
    .admin-card-delays {
      grid-column: auto;
    }

    .admin-delay-grid {
      grid-template-columns: 1fr;
    }

    .admin-users-wrap {
      grid-template-columns: 1fr;
    }

    .client-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .client-footer {
      justify-content: flex-start;
    }
  }

  /* Mobile */
@media (max-width: 768px) {
  .app-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 12px 14px;
  }

    .profile-dropdown {
      right: 0;
      left: auto;
      min-width: 210px;
    }

    .profile-modal-head {
      flex-direction: column;
      align-items: stretch;
    }

    .profile-modal-grid {
      grid-template-columns: 1fr;
    }

    .profile-bubble {
      width: 36px;
      height: 36px;
      font-size: 0.8rem;
    }

    .client-modal-panel {
      max-height: calc(100vh - 20px);
      padding: 14px;
    }

    .client-modal-head {
      flex-direction: column;
      align-items: stretch;
    }

    .client-form-grid {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .client-form-span-2 {
      grid-column: auto;
    }

    .client-modal-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .client-modal-actions .btn-outline,
    .client-modal-actions .btn-primary {
      width: 100%;
      min-height: 40px;
    }

  .header-right {
    justify-content: flex-start;
    gap: 6px;
  }

    .header-right .btn-secondary,
  .header-right .btn-outline {
    padding: 8px 11px;
    font-size: 0.84rem;
  }

  .user-info {
    white-space: normal;
    font-size: 0.8rem;
    width: 100%;
    line-height: 1.3;
  }

  .main {
    padding: 14px;
  }

  .top-bar {
    gap: 10px;
  }

  .tabs,
  .status-tabs,
  .view-toggle {
    width: 100%;
  }

   .tab-button,
  .status-button,
  .view-button {
    min-height: 36px;
    padding: 7px 12px;
    font-size: 0.83rem;
  }

  .filters-row {
    align-items: stretch;
    gap: 8px;
  }

  .filter-group {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
    gap: 5px;
  }

  .filter-group label {
    font-size: 0.82rem;
  }

  .filter-group select,
  .view-toggle,
  .search-box {
    width: 100%;
    max-width: 100%;
    min-width: 100%;
  }

  .view-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

   .filters-row > .btn-primary {
    width: 100%;
    min-height: 40px;
    font-size: 0.88rem;
  }

  .compact-row-click {
    padding: 11px 12px 13px;
    gap: 8px;
  }

  .compact-row-line1 {
    gap: 6px;
    align-items: flex-start;
    margin-bottom: 6px;
  }

  .compact-name {
    font-size: 0.95rem;
  }

  .compact-owner {
    white-space: normal;
    word-break: break-word;
    font-size: 0.8rem;
  }

  .compact-row-line2 {
    white-space: normal;
    overflow: visible;
    text-overflow: initial;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    line-clamp: 4;
    line-height: 1.4;
    padding-bottom: 2px;
  }

  .compact-row-right {
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-start;
    gap: 6px;
    padding-top: 1px;
  }

  .compact-expanded {
    padding: 0 10px 10px;
  }

  .field-row {
    flex-direction: column;
    gap: 2px;
    margin-bottom: 7px;
  }

  .field-key {
    min-width: 0;
  }

  .nextdue-row {
    align-items: stretch;
  }

  .nextdue-input {
    width: 100%;
  }

  .client-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .client-footer .btn-outline-small,
  .client-footer .btn-outline,
  .client-footer .btn-primary {
    width: 100%;
    text-align: center;
    min-height: 36px;
  }

  .auth-screen {
    padding: 14px;
  }

  .auth-card {
    padding: 18px 16px;
    border-radius: 16px;
  }

  .aftersale-grid {
    grid-template-columns: 1fr;
  }

  .search-box {
    min-width: 100%;
    max-width: 100%;
  }

  .search-input {
    min-height: 38px;
    padding: 9px 12px;
    font-size: 0.86rem;
  }

  .admin-form-grid {
    grid-template-columns: 1fr;
  }

  .admin-modal-backdrop {
    padding: 10px;
    align-items: stretch;
  }

  .admin-modal {
    padding: 14px;
    border-radius: 16px;
  }

  .admin-modal-xl {
    max-height: calc(100vh - 20px);
    height: fit-content;
  }

  .admin-modal-head {
    flex-direction: column;
    align-items: stretch;
  }

  .admin-user-row {
    flex-direction: column;
    align-items: stretch;
  }

  .admin-actions-row .btn-primary,
  .admin-actions-row .btn-outline {
    width: 100%;
    min-height: 40px;
  }

  .dash-kpis {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .kpi {
    padding: 10px;
  }

  .conversion-card,
  .dash-card,
  .dash-score {
    padding: 12px;
  }
}

  /* Small mobile */
  @media (max-width: 480px) {
    .header-left h1 {
      font-size: 1.28rem;
    }

    .dash-kpis {
      grid-template-columns: 1fr;
    }

    .compact-name,
    .client-name {
      font-size: 0.98rem;
    }

    .kpi-value,
    .dash-score-value,
    .conversion-card-value {
      font-size: 1.5rem;
    }

    .main {
      padding: 14px;
    }
  }
`;