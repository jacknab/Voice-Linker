import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeKind = "menu" | "endpoint";

interface TreeNode {
  id: string;
  label: string;
  kind: NodeKind;
  endpointNote?: string;
  choices?: { key: string; label: string }[];
  children?: TreeNode[];
}

// ─── IVR Tree Data ────────────────────────────────────────────────────────────

const TREE: TreeNode = {
  id: "inbound",
  label: "Inbound Call",
  kind: "menu",
  choices: [{ key: "auto", label: "Routes to Entry Router" }],
  children: [
    {
      id: "entry-router",
      label: "Entry Router",
      kind: "menu",
      choices: [
        { key: "→", label: "Returning member" },
        { key: "→", label: "New / unrecognized caller" },
      ],
      children: [
        {
          id: "membership-entry",
          label: "Membership Entry",
          kind: "menu",
          choices: [
            { key: "1", label: "Enter membership number" },
            { key: "2", label: "No membership → Entry Check" },
          ],
          children: [
            {
              id: "main-menu-a",
              label: "Main Menu",
              kind: "endpoint",
              endpointNote: "Verified member",
            },
          ],
        },
        {
          id: "entry-check",
          label: "Entry Check",
          kind: "menu",
          choices: [
            { key: "→", label: "Has active time" },
            { key: "→", label: "Free trial eligible" },
            { key: "→", label: "No access" },
          ],
          children: [
            {
              id: "free-trial",
              label: "Free Trial Offer",
              kind: "menu",
              choices: [
                { key: "1", label: "Accept → Main Menu" },
                { key: "2", label: "Decline → Purchase" },
              ],
              children: [
                { id: "ft-main", label: "Main Menu", kind: "endpoint", endpointNote: "Trial credited" },
                { id: "ft-purchase", label: "Purchase", kind: "endpoint", endpointNote: "Stripe flow" },
              ],
            },
            {
              id: "main-menu",
              label: "Main Menu",
              kind: "menu",
              choices: [
                { key: "★", label: "Male Box" },
                { key: "1", label: "Mailboxes & Ads" },
                { key: "2", label: "Add Time" },
                { key: "4", label: "Info & Prices" },
                { key: "8", label: "Manage Membership" },
                { key: "0", label: "Customer Service" },
              ],
              children: [
                {
                  id: "phone-booth",
                  label: "Male Box",
                  kind: "menu",
                  choices: [
                    { key: "→", label: "New caller → Record Name" },
                    { key: "→", label: "Returning → Greeting Setup" },
                  ],
                  children: [
                    {
                      id: "record-name",
                      label: "Record Name",
                      kind: "menu",
                      choices: [
                        { key: "→", label: "Record Greeting" },
                        { key: "→", label: "Review → Go Live" },
                      ],
                      children: [
                        { id: "go-live-new", label: "Browse Profiles", kind: "endpoint", endpointNote: "Live on system" },
                      ],
                    },
                    {
                      id: "greeting-setup",
                      label: "Greeting Setup",
                      kind: "menu",
                      choices: [
                        { key: "1", label: "Use existing → Go Live" },
                        { key: "2", label: "Re-record" },
                        { key: "3", label: "Hear greeting" },
                      ],
                      children: [
                        {
                          id: "browse",
                          label: "Browse Profiles",
                          kind: "menu",
                          choices: [
                            { key: "1", label: "Send message" },
                            { key: "3", label: "Connect live" },
                            { key: "2", label: "Next profile" },
                            { key: "#", label: "Exit to Main Menu" },
                          ],
                          children: [
                            { id: "live-connect", label: "Live Connect", kind: "endpoint", endpointNote: "Private conference" },
                            { id: "send-msg", label: "Send Message", kind: "endpoint", endpointNote: "Delivered to inbox" },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "mailbox-menu",
                  label: "Mailbox Menu",
                  kind: "menu",
                  choices: [
                    { key: "1", label: "My Mailbox" },
                    { key: "2", label: "Record Ad" },
                    { key: "3", label: "Listen to Ads" },
                  ],
                  children: [
                    {
                      id: "my-mailbox",
                      label: "My Mailbox",
                      kind: "menu",
                      choices: [
                        { key: "1", label: "Reply to message" },
                        { key: "3", label: "Skip message" },
                      ],
                      children: [
                        { id: "mb-reply", label: "Record Reply", kind: "endpoint", endpointNote: "Sent to sender" },
                      ],
                    },
                    {
                      id: "ad-category",
                      label: "Ad Category",
                      kind: "menu",
                      choices: [
                        { key: "1–5", label: "Browse category" },
                        { key: "6", label: "Mailbox lookup" },
                      ],
                      children: [
                        { id: "ad-browse", label: "Browse Ads", kind: "endpoint", endpointNote: "Play greetings" },
                      ],
                    },
                  ],
                },
                {
                  id: "add-time",
                  label: "Add Time",
                  kind: "menu",
                  choices: [
                    { key: "1", label: "Buy time package" },
                    { key: "2", label: "Enter coupon code" },
                  ],
                  children: [
                    { id: "purchase", label: "Purchase Flow", kind: "endpoint", endpointNote: "Stripe payment" },
                  ],
                },
                {
                  id: "info-menu",
                  label: "Info & Prices",
                  kind: "menu",
                  choices: [
                    { key: "1", label: "Hear prices" },
                    { key: "2", label: "Hear features" },
                  ],
                  children: [
                    { id: "info-end", label: "Main Menu", kind: "endpoint", endpointNote: "Returns to main" },
                  ],
                },
                {
                  id: "manage",
                  label: "Manage Membership",
                  kind: "menu",
                  choices: [
                    { key: "1", label: "Set / change PIN" },
                    { key: "2", label: "Cancel membership" },
                    { key: "3", label: "Hear balance" },
                  ],
                  children: [
                    { id: "manage-end", label: "Account Updated", kind: "endpoint", endpointNote: "Returns to main" },
                  ],
                },
                {
                  id: "cust-service",
                  label: "Customer Service",
                  kind: "endpoint",
                  endpointNote: "Transfers to agent",
                },
              ],
            },
            {
              id: "membership-purchase",
              label: "Purchase Flow",
              kind: "endpoint",
              endpointNote: "Stripe payment",
            },
          ],
        },
      ],
    },
  ],
};

// ─── CSS injected once ────────────────────────────────────────────────────────

const TREE_CSS = `
  .ivr-tree-children {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: flex-start;
    position: relative;
    padding-top: 0;
    gap: 0;
  }

  .ivr-tree-child-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    padding: 0 18px;
  }

  /* Horizontal bar: left half */
  .ivr-tree-child-wrap::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 50%;
    height: 2px;
    background: #93aad4;
  }

  /* Horizontal bar: right half */
  .ivr-tree-child-wrap::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 50%;
    height: 2px;
    background: #93aad4;
  }

  /* First child: no left half bar */
  .ivr-tree-child-wrap:first-child::before {
    display: none;
  }

  /* Last child: no right half bar */
  .ivr-tree-child-wrap:last-child::after {
    display: none;
  }

  /* Only child: hide all bars */
  .ivr-tree-child-wrap:only-child::before,
  .ivr-tree-child-wrap:only-child::after {
    display: none;
  }
`;

// ─── Node Components ──────────────────────────────────────────────────────────

function MenuBox({
  node,
  collapsed,
  onToggle,
  hasChildren,
}: {
  node: TreeNode;
  collapsed: boolean;
  onToggle: () => void;
  hasChildren: boolean;
}) {
  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden cursor-pointer select-none"
      style={{ minWidth: 160, maxWidth: 200, border: "1.5px solid #c8d8ea" }}
      onClick={onToggle}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center justify-between gap-2"
        style={{ background: "#1e7068" }}
      >
        <span className="text-white font-bold text-sm leading-tight">{node.label}</span>
        {hasChildren && (
          <span className="text-teal-200 flex-shrink-0 opacity-80">
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </span>
        )}
      </div>

      {/* Choices list */}
      {node.choices && node.choices.length > 0 && (
        <div style={{ background: "#ffffff" }}>
          <div
            className="px-3 pt-1.5 pb-1"
            style={{ borderBottom: "1px solid #e8eef5" }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "#8aa0b8" }}
            >
              Choices
            </span>
          </div>
          <div className="px-3 py-1.5 flex flex-col gap-1">
            {node.choices.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="text-[10px] font-mono font-bold rounded px-1.5 py-0.5 flex-shrink-0"
                  style={{ background: "#e4f0ee", color: "#1e7068" }}
                >
                  {c.key}
                </span>
                <span className="text-[11px] leading-tight" style={{ color: "#4a6070" }}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EndpointCircle({ node }: { node: TreeNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="rounded-full flex items-center justify-center text-center text-white font-semibold leading-tight shadow-sm"
        style={{
          width: 72,
          height: 72,
          background: "#1d8076",
          fontSize: 11,
          padding: 8,
        }}
      >
        {node.label}
      </div>
      {node.endpointNote && (
        <span
          className="text-center"
          style={{ fontSize: 10, color: "#8aa0b8", maxWidth: 80 }}
        >
          {node.endpointNote}
        </span>
      )}
    </div>
  );
}

// ─── Recursive Tree Node ──────────────────────────────────────────────────────

function TreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth >= 2);
  const hasChildren = !!(node.children && node.children.length > 0);

  if (node.kind === "endpoint") {
    return (
      <div className="flex flex-col items-center">
        {/* stem line into endpoint */}
        <div style={{ width: 2, height: 24, background: "#93aad4" }} />
        <EndpointCircle node={node} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <MenuBox
        node={node}
        collapsed={collapsed}
        onToggle={() => hasChildren && setCollapsed((c) => !c)}
        hasChildren={hasChildren}
      />

      {hasChildren && !collapsed && (
        <>
          {/* Stem down from parent to horizontal bar */}
          <div style={{ width: 2, height: 24, background: "#93aad4" }} />

          {/* Children row */}
          <div className="ivr-tree-children">
            {node.children!.map((child) => (
              <div key={child.id} className="ivr-tree-child-wrap">
                {/* Drop line from horizontal bar to child */}
                <div style={{ width: 2, height: 24, background: "#93aad4" }} />
                <TreeNode node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IvrFlowMap() {
  return (
    <div
      className="w-full min-h-full overflow-auto"
      style={{ background: "#edf2f7", padding: "40px 48px 80px" }}
    >
      <style>{TREE_CSS}</style>

      {/* Header */}
      <div className="text-center mb-10">
        <h1
          className="text-2xl font-bold"
          style={{ color: "#2d4a5a" }}
        >
          IVR Call Flow
        </h1>
        <p className="text-sm mt-1" style={{ color: "#7a99b0" }}>
          Click any menu box to expand or collapse its branch
        </p>
      </div>

      {/* Tree */}
      <div className="flex justify-center">
        <TreeNode node={TREE} depth={0} />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-10 mt-14 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="rounded"
            style={{ width: 28, height: 18, background: "#1e7068" }}
          />
          <span className="text-xs" style={{ color: "#7a99b0" }}>
            Menu / Router
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="rounded-full"
            style={{ width: 18, height: 18, background: "#1d8076" }}
          />
          <span className="text-xs" style={{ color: "#7a99b0" }}>
            Endpoint / Destination
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="rounded-sm"
            style={{
              width: 24,
              height: 2,
              background: "#93aad4",
            }}
          />
          <span className="text-xs" style={{ color: "#7a99b0" }}>
            Call path
          </span>
        </div>
      </div>
    </div>
  );
}
