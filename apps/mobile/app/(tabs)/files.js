import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import { getActiveProfile } from '../../src/storage.js';
import { fetchFsRoots, fetchFsList, fetchFsRead, openFsFolder } from '../../src/api.js';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] || 'B'}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FilesScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [items, setItems] = useState([]);
  const [roots, setRoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // File preview modal
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadRoots = useCallback(async (activeProf) => {
    if (!activeProf) return;
    try {
      const res = await fetchFsRoots(activeProf);
      if (Array.isArray(res?.roots)) {
        setRoots(res.roots);
        const initial = res.defaultWorkspace || res.currentRoot || res.roots[0]?.path;
        if (initial && !currentPath) {
          loadDirectory(activeProf, initial);
        }
      }
    } catch {}
  }, [currentPath]);

  const loadDirectory = async (prof, targetPath) => {
    if (!prof) return;
    setLoading(true);
    setSearchQuery('');
    try {
      const res = await fetchFsList(prof, targetPath);
      setCurrentPath(res.path);
      setParentPath(res.parent);
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (err) {
      Alert.alert('File Browser Error', err.message || 'Failed to list directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const active = await getActiveProfile();
      if (mounted) {
        setProfile(active);
        if (active) {
          loadRoots(active);
        } else {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadRoots]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const handleOpenFolderInIDE = async (folderPath = currentPath, newWindow = false) => {
    if (!profile) return;
    setActionLoading(true);
    try {
      const res = await openFsFolder(profile, { path: folderPath, newWindow });
      Alert.alert('Antigravity IDE', res.message || 'Folder opened in Antigravity');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to open folder in Antigravity');
    } finally {
      setActionLoading(false);
    }
  };

  const handleItemPress = async (item) => {
    if (item.isDirectory) {
      loadDirectory(profile, item.path);
    } else {
      // Preview text file
      setPreviewLoading(true);
      setPreviewModalVisible(true);
      try {
        const res = await fetchFsRead(profile, item.path);
        setPreviewFile(res);
      } catch (err) {
        Alert.alert('Preview Error', err.message || 'Failed to read file');
        setPreviewModalVisible(false);
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const handleItemLongPress = (item) => {
    if (!item.isDirectory) return;
    Alert.alert(
      item.name,
      item.path,
      [
        {
          text: 'Open in Antigravity',
          onPress: () => handleOpenFolderInIDE(item.path, false)
        },
        {
          text: 'Open in New Window',
          onPress: () => handleOpenFolderInIDE(item.path, true)
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(sep).filter(Boolean);
    const crumbs = [];

    let accum = currentPath.startsWith('/') ? '/' : '';
    for (let i = 0; i < parts.length; i++) {
      accum = accum === '/' ? `/${parts[i]}` : `${accum}${accum ? sep : ''}${parts[i]}`;
      crumbs.push({
        label: parts[i],
        path: accum
      });
    }
    return crumbs;
  }, [currentPath]);

  const monoFont = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar title="Files" subtitle={profile ? profile.name || 'PC Files' : 'Not connected'} />

      {/* Quick Roots Selector */}
      {roots.length > 0 && (
        <View style={styles.rootsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rootsContainer}>
            {roots.map((r) => {
              const isSelected = currentPath.toLowerCase().startsWith(r.path.toLowerCase());
              return (
                <TouchableOpacity
                  key={r.path}
                  style={[
                    styles.rootPill,
                    {
                      backgroundColor: isSelected ? theme.accent : theme.surface,
                      borderColor: isSelected ? theme.accent : theme.border
                    }
                  ]}
                  onPress={() => loadDirectory(profile, r.path)}
                >
                  <Text
                    style={[
                      styles.rootPillText,
                      { color: isSelected ? '#ffffff' : theme.text }
                    ]}
                  >
                    {r.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Breadcrumb Navigation Bar */}
      <View style={[styles.breadcrumbBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.upBtn}
          onPress={() => parentPath && loadDirectory(profile, parentPath)}
          disabled={!parentPath || loading}
        >
          <Icon name="chevron-up" size={16} color={parentPath ? theme.accent : theme.textMuted} />
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbContent}>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.path}>
                <TouchableOpacity
                  onPress={() => !isLast && loadDirectory(profile, crumb.path)}
                  disabled={isLast || loading}
                >
                  <Text
                    style={[
                      styles.breadcrumbText,
                      {
                        color: isLast ? theme.text : theme.textMuted,
                        fontWeight: isLast ? '700' : '500'
                      }
                    ]}
                  >
                    {crumb.label}
                  </Text>
                </TouchableOpacity>
                {!isLast && <Text style={[styles.breadcrumbSep, { color: theme.textMuted }]}>/</Text>}
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>

      {/* Open in Antigravity Action Banner */}
      <View style={[styles.actionBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.actionLeft}>
          <Icon name="monitor" size={16} color={theme.accent} />
          <Text style={[styles.actionPath, { color: theme.text }]} numberOfLines={1}>
            {breadcrumbs[breadcrumbs.length - 1]?.label || 'Workspace'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.openIdeBtn, { backgroundColor: theme.accent }]}
          onPress={() => handleOpenFolderInIDE(currentPath, false)}
          disabled={actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Icon name="send" size={12} color="#ffffff" />
              <Text style={styles.openIdeBtnText}>Open in Antigravity</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter / Search Bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="file" size={14} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Filter files in directory..."
          placeholderTextColor={theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="x" size={14} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* File & Directory FlatList */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading files...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.path}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 14) + 84 }
          ]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.itemRow, { borderBottomColor: theme.border }]}
              onPress={() => handleItemPress(item)}
              onLongPress={() => handleItemLongPress(item)}
            >
              <View style={styles.itemIconCol}>
                <Icon
                  name={item.isDirectory ? 'grid' : 'file'}
                  size={19}
                  color={item.isDirectory ? theme.accent : theme.textMuted}
                />
              </View>

              <View style={styles.itemInfoCol}>
                <Text
                  style={[
                    styles.itemName,
                    {
                      color: item.isDirectory ? theme.text : theme.textMuted,
                      fontWeight: item.isDirectory ? '600' : '400'
                    }
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <View style={styles.itemMetaRow}>
                  {!item.isDirectory && (
                    <Text style={[styles.itemMetaText, { color: theme.textMuted }]}>
                      {formatBytes(item.size)} ·{' '}
                    </Text>
                  )}
                  <Text style={[styles.itemMetaText, { color: theme.textMuted }]}>
                    {formatDate(item.mtime)}
                  </Text>
                </View>
              </View>

              <Icon name="chevron" size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {searchQuery ? 'No matching files found' : 'Empty folder'}
              </Text>
            </View>
          }
        />
      )}

      {/* File Preview Modal */}
      <Modal visible={previewModalVisible} animationType="slide" transparent={false}>
        <View style={[styles.previewModalRoot, { backgroundColor: theme.bg }]}>
          <View style={[styles.previewHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <View style={styles.previewTitleCol}>
              <Text style={[styles.previewTitle, { color: theme.text }]} numberOfLines={1}>
                {previewFile?.name || 'File Preview'}
              </Text>
              <Text style={[styles.previewSubtitle, { color: theme.textMuted }]}>
                {previewFile?.language || 'text'} · {formatBytes(previewFile?.size)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.previewCloseBtn, { backgroundColor: theme.border }]}
              onPress={() => setPreviewModalVisible(false)}
            >
              <Icon name="x" size={16} color={theme.text} />
            </TouchableOpacity>
          </View>

          {previewLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : previewFile?.isBinary ? (
            <View style={styles.centerContainer}>
              <Icon name="file" size={48} color={theme.textMuted} />
              <Text style={[styles.binaryNotice, { color: theme.textMuted }]}>
                Binary file preview not supported ({formatBytes(previewFile?.size)})
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent}>
              <Text style={[styles.previewText, { color: theme.text, fontFamily: monoFont }]}>
                {previewFile?.content || ''}
              </Text>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  rootsRow: {
    height: 38,
    marginTop: 4
  },
  rootsContainer: {
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6
  },
  rootPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth
  },
  rootPillText: {
    fontSize: 11,
    fontWeight: '600'
  },
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  upBtn: {
    padding: 4,
    marginRight: 6
  },
  breadcrumbContent: {
    alignItems: 'center',
    flexDirection: 'row'
  },
  breadcrumbText: {
    fontSize: 12
  },
  breadcrumbSep: {
    marginHorizontal: 4,
    fontSize: 11
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8
  },
  actionPath: {
    fontSize: 12,
    fontWeight: '700'
  },
  openIdeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5
  },
  openIdeBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700'
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 2
  },
  listContent: {
    paddingHorizontal: 10
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  itemIconCol: {
    width: 32,
    alignItems: 'center'
  },
  itemInfoCol: {
    flex: 1,
    marginLeft: 6
  },
  itemName: {
    fontSize: 13
  },
  itemMetaRow: {
    flexDirection: 'row',
    marginTop: 2
  },
  itemMetaText: {
    fontSize: 10.5
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  loadingText: {
    fontSize: 12
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 12
  },
  previewModalRoot: {
    flex: 1
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  previewTitleCol: {
    flex: 1,
    marginRight: 10
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  previewSubtitle: {
    fontSize: 11,
    marginTop: 2
  },
  previewCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewScroll: {
    flex: 1
  },
  previewScrollContent: {
    padding: 14
  },
  previewText: {
    fontSize: 11.5,
    lineHeight: 18
  },
  binaryNotice: {
    fontSize: 13,
    marginTop: 10
  }
});

