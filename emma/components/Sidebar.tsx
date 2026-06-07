import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Conversation, Project, useChatContext } from "@/context/ChatContext";
import { useColors } from "@/hooks/useColors";

const SIDEBAR_WIDTH = Math.min(310, Dimensions.get("window").width * 0.82);
type Tab = "chats" | "folders" | "archive";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function groupByDate(convs: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

  const groups: Record<string, Conversation[]> = {
    Today: [], Yesterday: [], "Last 7 days": [], "Last 30 days": [], Older: [],
  };
  for (const c of convs) {
    const d = new Date(c.createdAt);
    if (d >= today) groups["Today"]!.push(c);
    else if (d >= yesterday) groups["Yesterday"]!.push(c);
    else if (d >= weekAgo) groups["Last 7 days"]!.push(c);
    else if (d >= monthAgo) groups["Last 30 days"]!.push(c);
    else groups["Older"]!.push(c);
  }
  return Object.entries(groups).filter(([, items]) => items.length > 0).map(([label, items]) => ({ label, items }));
}

function MenuItem({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Feather name={icon as any} size={14} color={color} />
      <Text style={[styles.menuItemText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}
function MenuDivider({ color }: { color: string }) {
  return <View style={[styles.menuDivider, { backgroundColor: color }]} />;
}

interface ConvItemProps {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onShare: () => void;
  onCopy: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onMoveToFolder?: () => void;
  isArchived?: boolean;
}

function ConvItem({ conv, isActive, onSelect, onDelete, onRename, onShare, onCopy, onArchive, onUnarchive, onMoveToFolder, isArchived }: ConvItemProps) {
  const c = useColors();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState(conv.title);

  const handleRenameSubmit = () => {
    const trimmed = renameText.trim();
    if (trimmed && trimmed !== conv.title) onRename(trimmed);
    setRenaming(false); setMenuOpen(false);
  };

  if (renaming) {
    return (
      <View style={[styles.renameRow, { backgroundColor: c.highlight }]}>
        <TextInput
          style={[styles.renameInput, { color: c.foreground, borderColor: c.border }]}
          value={renameText} onChangeText={setRenameText}
          onSubmitEditing={handleRenameSubmit} onBlur={() => setRenaming(false)}
          autoFocus selectTextOnFocus returnKeyType="done"
        />
        <TouchableOpacity onPress={handleRenameSubmit} style={styles.renameOk}>
          <Feather name="check" size={16} color={c.foreground} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity
        style={[styles.convItem, isActive && { backgroundColor: c.secondary }]}
        onPress={onSelect} activeOpacity={0.7}
      >
        <Text style={[styles.convTitle, { color: isActive ? c.foreground : c.mutedForeground }]} numberOfLines={1}>
          {conv.title}
        </Text>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => { Haptics.selectionAsync(); setMenuOpen((v) => !v); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="more-horizontal" size={16} color={menuOpen ? c.foreground : c.mutedForeground} />
        </TouchableOpacity>
      </TouchableOpacity>

      {menuOpen && (
        <View style={[styles.menu, { backgroundColor: c.card, borderColor: c.border }]}>
          {!isArchived && (
            <>
              <MenuItem icon="edit-2" label="Rename" color={c.foreground} onPress={() => {
                setRenameText(conv.title); setMenuOpen(false); setTimeout(() => setRenaming(true), 80);
              }} />
              <MenuDivider color={c.border} />
              {onMoveToFolder && (
                <>
                  <MenuItem icon="folder" label="Move to folder" color={c.foreground} onPress={() => { onMoveToFolder(); setMenuOpen(false); }} />
                  <MenuDivider color={c.border} />
                </>
              )}
              <MenuItem icon="share-2" label="Share link" color={c.foreground} onPress={() => { onShare(); setMenuOpen(false); }} />
              <MenuDivider color={c.border} />
              <MenuItem icon="copy" label="Copy title" color={c.foreground} onPress={() => { onCopy(); setMenuOpen(false); }} />
              <MenuDivider color={c.border} />
              {onArchive && (
                <>
                  <MenuItem icon="archive" label="Archive" color={c.foreground} onPress={() => { setMenuOpen(false); onArchive(); }} />
                  <MenuDivider color={c.border} />
                </>
              )}
            </>
          )}
          {isArchived && onUnarchive && (
            <>
              <MenuItem icon="rotate-ccw" label="Unarchive" color={c.foreground} onPress={() => { setMenuOpen(false); onUnarchive(); }} />
              <MenuDivider color={c.border} />
            </>
          )}
          <MenuItem icon="trash-2" label="Delete" color={c.destructive} onPress={() => {
            setMenuOpen(false);
            if (Platform.OS === "web") {
              setTimeout(() => { if (window.confirm("Delete this conversation?")) onDelete(); }, 100);
            } else {
              Alert.alert("Delete conversation", "This cannot be undone.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: onDelete },
              ]);
            }
          }} />
        </View>
      )}
    </View>
  );
}

interface FolderItemProps {
  project: Project;
  convs: Conversation[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onRenameProject: (name: string) => void;
  onDeleteProject: () => void;
  onConvDelete: (id: number) => void;
  onConvRename: (id: number, title: string) => void;
  onConvShare: (conv: Conversation) => void;
  onConvCopy: (conv: Conversation) => void;
  onConvArchive: (id: number) => void;
  onConvRemoveFromFolder: (id: number) => void;
}

function FolderItem({ project, convs, currentId, onSelect, onRenameProject, onDeleteProject, onConvDelete, onConvRename, onConvShare, onConvCopy, onConvArchive, onConvRemoveFromFolder }: FolderItemProps) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState(project.name);

  const handleRenameSubmit = () => {
    const trimmed = renameText.trim();
    if (trimmed && trimmed !== project.name) onRenameProject(trimmed);
    setRenaming(false); setMenuOpen(false);
  };

  return (
    <View style={styles.folderBlock}>
      <TouchableOpacity
        style={[styles.folderRow, { backgroundColor: open ? c.secondary : "transparent" }]}
        onPress={() => setOpen((v) => !v)} activeOpacity={0.7}
      >
        <Text style={styles.folderEmoji}>{project.emoji}</Text>
        {renaming ? (
          <TextInput
            style={[styles.folderRenameInput, { color: c.foreground, flex: 1 }]}
            value={renameText} onChangeText={setRenameText}
            onSubmitEditing={handleRenameSubmit} onBlur={() => setRenaming(false)}
            autoFocus selectTextOnFocus returnKeyType="done"
          />
        ) : (
          <Text style={[styles.folderName, { color: c.foreground }]} numberOfLines={1}>{project.name}</Text>
        )}
        <Text style={[styles.folderCount, { color: c.mutedForeground }]}>{convs.length}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={14} color={c.mutedForeground} style={{ marginLeft: 2 }} />
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); setMenuOpen((v) => !v); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="more-horizontal" size={15} color={menuOpen ? c.foreground : c.mutedForeground} />
        </TouchableOpacity>
      </TouchableOpacity>

      {menuOpen && (
        <View style={[styles.menu, { backgroundColor: c.card, borderColor: c.border, marginLeft: 8 }]}>
          <MenuItem icon="edit-2" label="Rename folder" color={c.foreground} onPress={() => {
            setRenameText(project.name); setMenuOpen(false); setTimeout(() => setRenaming(true), 80);
          }} />
          <MenuDivider color={c.border} />
          <MenuItem icon="trash-2" label="Delete folder" color={c.destructive} onPress={() => {
            setMenuOpen(false);
            if (Platform.OS === "web") {
              setTimeout(() => { if (window.confirm(`Delete folder "${project.name}"? Chats will be moved out.`)) onDeleteProject(); }, 100);
            } else {
              Alert.alert("Delete folder", `Delete "${project.name}"? Chats inside will be moved out.`, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: onDeleteProject },
              ]);
            }
          }} />
        </View>
      )}

      {open && convs.length === 0 && (
        <Text style={[styles.emptyFolderText, { color: c.mutedForeground }]}>No chats in this folder</Text>
      )}

      {open && convs.map((conv) => (
        <View key={conv.id} style={styles.folderConvIndent}>
          <ConvItem
            conv={conv}
            isActive={conv.id === currentId}
            onSelect={() => onSelect(conv.id)}
            onDelete={() => onConvDelete(conv.id)}
            onRename={(t) => onConvRename(conv.id, t)}
            onShare={() => onConvShare(conv)}
            onCopy={() => onConvCopy(conv)}
            onArchive={() => onConvArchive(conv.id)}
            onMoveToFolder={() => onConvRemoveFromFolder(conv.id)}
          />
        </View>
      ))}
    </View>
  );
}

interface MoveToFolderSheetProps {
  conv: Conversation;
  projects: Project[];
  onAssign: (projectId: number | null) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function MoveToFolderSheet({ conv, projects, onAssign, onClose, colors: c }: MoveToFolderSheetProps) {
  return (
    <View style={[styles.moveSheet, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.moveSheetHeader}>
        <Text style={[styles.moveSheetTitle, { color: c.foreground }]}>Move to folder</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={18} color={c.mutedForeground} />
        </TouchableOpacity>
      </View>
      {conv.projectId != null && (
        <TouchableOpacity style={styles.moveItem} onPress={() => { onAssign(null); onClose(); }}>
          <Feather name="x-circle" size={16} color={c.mutedForeground} />
          <Text style={[styles.moveItemText, { color: c.mutedForeground }]}>Remove from folder</Text>
        </TouchableOpacity>
      )}
      {projects.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={[styles.moveItem, conv.projectId === p.id && { backgroundColor: c.secondary }]}
          onPress={() => { onAssign(p.id); onClose(); }}
        >
          <Text style={styles.moveItemEmoji}>{p.emoji}</Text>
          <Text style={[styles.moveItemText, { color: c.foreground }]}>{p.name}</Text>
          {conv.projectId === p.id && <Feather name="check" size={14} color={c.foreground} style={{ marginLeft: "auto" as any }} />}
        </TouchableOpacity>
      ))}
      {projects.length === 0 && (
        <Text style={[styles.emptyText, { color: c.mutedForeground, paddingVertical: 16 }]}>No folders yet — create one first</Text>
      )}
    </View>
  );
}

export function Sidebar({ visible, onClose }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const {
    conversations, currentConversationId, selectConversation,
    deleteConversation, renameConversation, startNewChat, loadConversations,
    shareConversation, assignConversationToProject, archiveConversation, unarchiveConversation,
    projects, createProject, renameProject, deleteProject,
  } = useChatContext();

  const [tab, setTab] = useState<Tab>("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveConv, setMoveConv] = useState<Conversation | null>(null);

  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const hasShownRef = useRef(false);
  const nd = Platform.OS !== "web";

  useEffect(() => {
    if (visible) {
      hasShownRef.current = true;
      loadConversations();
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: nd, damping: 20, stiffness: 200 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: nd }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -SIDEBAR_WIDTH, duration: 220, useNativeDriver: nd }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: nd }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim, loadConversations, nd]);

  const handleSelect = useCallback((id: number) => { selectConversation(id); onClose(); }, [selectConversation, onClose]);

  const handleShare = useCallback(async (conv: Conversation) => {
    Haptics.selectionAsync();
    try {
      const url = await shareConversation(conv.id);
      if (!url) { Alert.alert("Share failed", "Could not generate share link."); return; }
      await Clipboard.setStringAsync(url);
      if (Platform.OS === "web") {
        if (navigator.share) navigator.share({ url, title: conv.title }).catch(() => {});
        else Alert.alert("Link copied!", url);
      } else {
        Alert.alert("Share link copied", "A shareable link has been copied to your clipboard.", [{ text: "OK" }]);
      }
    } catch { Alert.alert("Share failed", "Could not generate share link."); }
  }, [shareConversation]);

  const handleCopy = useCallback((conv: Conversation) => {
    Clipboard.setStringAsync(conv.title); Haptics.selectionAsync();
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await createProject(name);
    setNewFolderName(""); setCreatingFolder(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newFolderName, createProject]);

  const activeConvs = useMemo(() => conversations.filter((cv) => !cv.archivedAt), [conversations]);
  const archivedConvs = useMemo(() => conversations.filter((cv) => !!cv.archivedAt), [conversations]);

  const filteredActive = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? activeConvs.filter((cv) => cv.title.toLowerCase().includes(q)) : activeConvs;
  }, [activeConvs, searchQuery]);

  const unfolderedConvs = useMemo(() => filteredActive.filter((cv) => !cv.projectId), [filteredActive]);

  const groups = searchQuery.trim()
    ? (unfolderedConvs.length > 0 ? [{ label: "Results", items: unfolderedConvs }] : [])
    : groupByDate(unfolderedConvs);

  const filteredArchive = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? archivedConvs.filter((cv) => cv.title.toLowerCase().includes(q)) : archivedConvs;
  }, [archivedConvs, searchQuery]);

  if (!hasShownRef.current && !visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.sidebarRoot, { pointerEvents: visible ? "auto" : "none" } as any]}>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim, pointerEvents: visible ? "auto" : "none" } as any]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sidebar,
          { backgroundColor: c.card, borderRightColor: c.border, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16, transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* Header */}
        <View style={[styles.sidebarHeader, { borderBottomColor: c.border }]}>
          <Text style={[styles.sidebarTitle, { color: c.foreground }]}>Emma</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeSidebarBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={20} color={c.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* New Chat */}
        <TouchableOpacity
          style={[styles.newChatBtn, { backgroundColor: c.secondary, borderColor: c.border }]}
          onPress={() => { startNewChat(); onClose(); Haptics.selectionAsync(); }}
          activeOpacity={0.75}
        >
          <Feather name="plus" size={16} color={c.foreground} />
          <Text style={[styles.newChatText, { color: c.foreground }]}>New Chat</Text>
        </TouchableOpacity>

        {/* Tab Bar */}
        <View style={[styles.tabBar, { borderColor: c.border, backgroundColor: c.secondary }]}>
          {(["chats", "folders", "archive"] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && { backgroundColor: c.card }]}
              onPress={() => { setTab(t); setSearchQuery(""); }}
              activeOpacity={0.8}
            >
              <Feather
                name={t === "chats" ? "message-square" : t === "folders" ? "folder" : "archive"}
                size={13}
                color={tab === t ? c.foreground : c.mutedForeground}
              />
              <Text style={[styles.tabLabel, { color: tab === t ? c.foreground : c.mutedForeground }]}>
                {t === "chats" ? "Chats" : t === "folders" ? "Folders" : "Archive"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search (chats + archive) */}
        {(tab === "chats" || tab === "archive") && (
          <View style={[styles.searchBar, { backgroundColor: c.secondary, borderColor: c.border }]}>
            <Feather name="search" size={14} color={c.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: c.foreground }]}
              placeholder={tab === "archive" ? "Search archive..." : "Search chats..."}
              placeholderTextColor={c.mutedForeground}
              value={searchQuery} onChangeText={setSearchQuery}
              returnKeyType="search" clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={13} color={c.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── CHATS TAB ── */}
        {tab === "chats" && (
          <ScrollView style={styles.convList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {projects.map((proj) => {
              const projConvs = filteredActive.filter((cv) => cv.projectId === proj.id);
              return (
                <FolderItem
                  key={proj.id} project={proj} convs={projConvs} currentId={currentConversationId}
                  onSelect={handleSelect}
                  onRenameProject={(name) => renameProject(proj.id, name)}
                  onDeleteProject={() => deleteProject(proj.id)}
                  onConvDelete={(id) => deleteConversation(id)}
                  onConvRename={(id, t) => renameConversation(id, t)}
                  onConvShare={(cv) => handleShare(cv)}
                  onConvCopy={(cv) => handleCopy(cv)}
                  onConvArchive={(id) => archiveConversation(id)}
                  onConvRemoveFromFolder={(id) => assignConversationToProject(id, null)}
                />
              );
            })}

            {groups.length === 0 && projects.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
                {searchQuery.trim() ? `No results for "${searchQuery}"` : "No conversations yet"}
              </Text>
            ) : (
              groups.map((group) => (
                <View key={group.label}>
                  {(projects.length > 0 && group.items.length > 0) && (
                    <Text style={[styles.groupLabel, { color: c.mutedForeground }]}>Other</Text>
                  )}
                  {projects.length === 0 && (
                    <Text style={[styles.groupLabel, { color: c.mutedForeground }]}>{group.label}</Text>
                  )}
                  {group.items.map((conv) => (
                    <ConvItem
                      key={conv.id} conv={conv} isActive={conv.id === currentConversationId}
                      onSelect={() => handleSelect(conv.id)}
                      onDelete={() => deleteConversation(conv.id)}
                      onRename={(t) => renameConversation(conv.id, t)}
                      onShare={() => handleShare(conv)}
                      onCopy={() => handleCopy(conv)}
                      onArchive={() => archiveConversation(conv.id)}
                      onMoveToFolder={() => setMoveConv(conv)}
                    />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* ── FOLDERS TAB ── */}
        {tab === "folders" && (
          <ScrollView style={styles.convList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {creatingFolder ? (
              <View style={[styles.newFolderRow, { borderColor: c.border, backgroundColor: c.secondary }]}>
                <Text style={styles.newFolderEmoji}>📁</Text>
                <TextInput
                  style={[styles.newFolderInput, { color: c.foreground }]}
                  placeholder="Folder name..." placeholderTextColor={c.mutedForeground}
                  value={newFolderName} onChangeText={setNewFolderName}
                  onSubmitEditing={handleCreateFolder}
                  onBlur={() => { if (!newFolderName.trim()) setCreatingFolder(false); }}
                  autoFocus returnKeyType="done"
                />
                <TouchableOpacity onPress={handleCreateFolder} style={styles.newFolderOk}>
                  <Feather name="check" size={16} color={c.foreground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setCreatingFolder(false); setNewFolderName(""); }} style={styles.newFolderOk}>
                  <Feather name="x" size={16} color={c.mutedForeground} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.createFolderBtn, { borderColor: c.border }]}
                onPress={() => setCreatingFolder(true)} activeOpacity={0.7}
              >
                <Feather name="folder-plus" size={16} color={c.mutedForeground} />
                <Text style={[styles.createFolderText, { color: c.mutedForeground }]}>New folder</Text>
              </TouchableOpacity>
            )}

            {projects.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.mutedForeground }]}>No folders yet</Text>
            ) : (
              projects.map((proj) => {
                const projConvs = activeConvs.filter((cv) => cv.projectId === proj.id);
                return (
                  <FolderItem
                    key={proj.id} project={proj} convs={projConvs} currentId={currentConversationId}
                    onSelect={handleSelect}
                    onRenameProject={(name) => renameProject(proj.id, name)}
                    onDeleteProject={() => deleteProject(proj.id)}
                    onConvDelete={(id) => deleteConversation(id)}
                    onConvRename={(id, t) => renameConversation(id, t)}
                    onConvShare={(cv) => handleShare(cv)}
                    onConvCopy={(cv) => handleCopy(cv)}
                    onConvArchive={(id) => archiveConversation(id)}
                    onConvRemoveFromFolder={(id) => assignConversationToProject(id, null)}
                  />
                );
              })
            )}
          </ScrollView>
        )}

        {/* ── ARCHIVE TAB ── */}
        {tab === "archive" && (
          <ScrollView style={styles.convList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {filteredArchive.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
                {searchQuery.trim() ? `No results for "${searchQuery}"` : "No archived chats"}
              </Text>
            ) : (
              <>
                <Text style={[styles.archiveHint, { color: c.mutedForeground }]}>
                  {archivedConvs.length} archived chat{archivedConvs.length !== 1 ? "s" : ""}
                </Text>
                {filteredArchive.map((conv) => (
                  <ConvItem
                    key={conv.id} conv={conv} isActive={conv.id === currentConversationId}
                    onSelect={() => handleSelect(conv.id)}
                    onDelete={() => deleteConversation(conv.id)}
                    onRename={(t) => renameConversation(conv.id, t)}
                    onShare={() => handleShare(conv)}
                    onCopy={() => handleCopy(conv)}
                    onUnarchive={() => unarchiveConversation(conv.id)}
                    isArchived
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}

        {/* Move-to-folder overlay */}
        {moveConv && (
          <View style={[StyleSheet.absoluteFillObject, { justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }]}>
            <MoveToFolderSheet
              conv={moveConv} projects={projects}
              onAssign={(pid) => assignConversationToProject(moveConv.id, pid)}
              onClose={() => setMoveConv(null)}
              colors={c}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarRoot: { zIndex: 100, elevation: 100 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sidebar: {
    position: "absolute", top: 0, bottom: 0, left: 0,
    width: SIDEBAR_WIDTH, borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 30,
  },
  sidebarHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sidebarTitle: { fontSize: 17, fontWeight: "700" as const, letterSpacing: -0.3 },
  closeSidebarBtn: { padding: 6 },
  newChatBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    margin: 12, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
  },
  newChatText: { fontSize: 14, fontWeight: "500" as const },
  tabBar: {
    flexDirection: "row", marginHorizontal: 12, marginBottom: 8,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", padding: 3,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 7, borderRadius: 8,
  },
  tabLabel: { fontSize: 11, fontWeight: "600" as const },
  convList: { flex: 1, paddingHorizontal: 8 },
  groupLabel: {
    fontSize: 10, fontWeight: "600" as const, letterSpacing: 0.8,
    paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4, textTransform: "uppercase" as const,
  },
  convItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 9, paddingLeft: 10, paddingRight: 4,
    borderRadius: 8, marginVertical: 1,
  },
  convTitle: { flex: 1, fontSize: 14, lineHeight: 20 },
  menuBtn: { padding: 6, marginLeft: 2 },
  menu: { marginHorizontal: 8, marginBottom: 4, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  menuItemText: { fontSize: 14 },
  menuDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  renameRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginVertical: 1, marginHorizontal: 2,
  },
  renameInput: { flex: 1, fontSize: 14, borderBottomWidth: 1, paddingVertical: 6, paddingHorizontal: 4 },
  renameOk: { padding: 6 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  emptyText: { fontSize: 14, textAlign: "center" as const, paddingTop: 32 },
  archiveHint: { fontSize: 11, textAlign: "center" as const, paddingTop: 12, paddingBottom: 4 },
  folderBlock: { marginBottom: 2 },
  folderRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 9, paddingLeft: 8, paddingRight: 4,
    borderRadius: 8, marginVertical: 1,
  },
  folderEmoji: { fontSize: 15 },
  folderName: { flex: 1, fontSize: 14, fontWeight: "500" as const },
  folderCount: { fontSize: 11 },
  folderRenameInput: { fontSize: 14, paddingVertical: 2 },
  folderConvIndent: { paddingLeft: 12 },
  emptyFolderText: { fontSize: 12, paddingLeft: 28, paddingVertical: 6 },
  createFolderBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 8, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed" as const,
  },
  createFolderText: { fontSize: 13 },
  newFolderRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 8, marginBottom: 12, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1,
  },
  newFolderEmoji: { fontSize: 15 },
  newFolderInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  newFolderOk: { padding: 4 },
  moveSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderBottomWidth: 0, padding: 16, paddingBottom: 32,
  },
  moveSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  moveSheetTitle: { fontSize: 16, fontWeight: "600" as const },
  moveItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10,
  },
  moveItemEmoji: { fontSize: 18 },
  moveItemText: { fontSize: 15 },
});
