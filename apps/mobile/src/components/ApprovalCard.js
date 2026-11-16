import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform
} from 'react-native';
import { useTheme } from '../theme.js';
import Icon from './Icon.js';
import DiffViewer from './DiffViewer.js';

const fontSemiBold = Platform.select({
  ios: 'Poppins-SemiBold',
  android: 'Poppins_600SemiBold',
  default: 'System'
});

const fontMono = Platform.select({
  ios: 'JetBrainsMono-Regular',
  android: 'monospace',
  default: 'monospace'
});

export default function ApprovalCard({
  approval,
  onApprove,
  onReject,
  onDismiss
}) {
  const { theme, isDark } = useTheme();
  const [editedCommand, setEditedCommand] = useState(
    approval?.command || approval?.proposedCommandLine || ''
  );
  const [selectedOption, setSelectedOption] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  if (!approval) return null;

  const kind = approval.kind || 'permission';

  const handleApproveAction = (scope = 'once') => {
    onApprove({
      scope,
      response: editedCommand || undefined,
      option: selectedOption
    });
  };

  const handleRejectAction = () => {
    onReject(rejectReason || undefined);
  };

  const renderKindContent = () => {
    switch (kind) {
      case 'runCommand':
        return (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>COMMAND LINE</Text>
            <View style={[styles.codeBox, { backgroundColor: theme.raised, borderColor: theme.border }]}>
              <TextInput
                style={[styles.codeText, { color: theme.text }]}
                value={editedCommand}
                onChangeText={setEditedCommand}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        );

      case 'filePermission':
        return (
          <View style={styles.section}>
            {Boolean(approval.path || approval.absolutePathUri) && (
              <View style={[styles.pathRow, { backgroundColor: theme.raised, borderColor: theme.border }]}>
                <Icon name="folder" size={14} color={theme.accent} />
                <Text style={[styles.pathText, { color: theme.text }]} numberOfLines={1}>
                  {approval.path || approval.absolutePathUri}
                </Text>
              </View>
            )}
            {Boolean(approval.diff) && (
              <DiffViewer diff={approval.diff} maxHeight={220} />
            )}
          </View>
        );

      case 'openBrowserUrl':
      case 'readUrlContent':
        return (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>TARGET URL</Text>
            <View style={[styles.pathRow, { backgroundColor: theme.raised, borderColor: theme.border }]}>
              <Icon name="globe" size={14} color={theme.accent} />
              <Text style={[styles.pathText, { color: theme.text }]} numberOfLines={2}>
                {approval.url || approval.targetUrl || approval.summary}
              </Text>
            </View>
          </View>
        );

      case 'mcp':
        return (
          <View style={styles.section}>
            {Boolean(approval.toolName) && (
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                TOOL: {approval.toolName.toUpperCase()}
              </Text>
            )}
            {Boolean(approval.toolArgs) && (
              <View style={[styles.codeBox, { backgroundColor: theme.raised, borderColor: theme.border }]}>
                <Text style={[styles.codeText, { color: theme.text }]}>
                  {typeof approval.toolArgs === 'string'
                    ? approval.toolArgs
                    : JSON.stringify(approval.toolArgs, null, 2)}
                </Text>
              </View>
            )}
          </View>
        );

      case 'ask_question':
        return (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>SELECT OPTION</Text>
            {Array.isArray(approval.options) && approval.options.length > 0 ? (
              approval.options.map((opt, i) => {
                const label = typeof opt === 'string' ? opt : opt.label || `Option ${i + 1}`;
                const isSelected = selectedOption === i || selectedOption === label;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.choiceCard,
                      {
                        backgroundColor: isSelected ? `${theme.primary}22` : theme.raised,
                        borderColor: isSelected ? theme.primary : theme.border
                      }
                    ]}
                    onPress={() => setSelectedOption(typeof opt === 'object' ? opt : { index: i, text: label })}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.choiceIndex, { backgroundColor: isSelected ? theme.primary : theme.border }]}>
                      <Text style={styles.choiceIndexText}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.choiceLabel, { color: theme.text }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })
            ) : null}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <View style={[styles.kindBadge, { backgroundColor: `${theme.warning || '#f59e0b'}22`, borderColor: `${theme.warning || '#f59e0b'}55` }]}>
            <Text style={[styles.kindBadgeText, { color: theme.warning || '#f59e0b' }]}>
              {kind.toUpperCase().replace(/_/g, ' ')}
            </Text>
          </View>
          {onDismiss && (
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="x" size={18} color={theme.muted} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.title, { color: theme.text }]}>Approval Requested</Text>
        <Text style={[styles.summary, { color: theme.textSecondary }]}>
          {approval.summary || 'Antigravity requires your authorization to proceed.'}
        </Text>

        <ScrollView style={styles.scrollArea} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {renderKindContent()}

          {showRejectInput && (
            <View style={styles.rejectInputBox}>
              <Text style={[styles.sectionTitle, { color: theme.danger || '#ef4444' }]}>REJECTION REASON (OPTIONAL)</Text>
              <TextInput
                style={[styles.rejectInput, { backgroundColor: theme.raised, borderColor: theme.border, color: theme.text }]}
                placeholder="Explain why this step is rejected..."
                placeholderTextColor={theme.muted}
                value={rejectReason}
                onChangeText={setRejectReason}
              />
            </View>
          )}
        </ScrollView>

        <View style={styles.actionsCol}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
            onPress={() => handleApproveAction('once')}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>Approve Once</Text>
          </TouchableOpacity>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.halfBtn, { backgroundColor: theme.raised, borderColor: theme.border }]}
              onPress={() => handleApproveAction('conversation')}
              activeOpacity={0.8}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Always in Session</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.halfBtn,
                {
                  backgroundColor: showRejectInput ? (theme.danger || '#ef4444') : theme.raised,
                  borderColor: theme.border
                }
              ]}
              onPress={() => {
                if (showRejectInput) {
                  handleRejectAction();
                } else {
                  setShowRejectInput(true);
                }
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.secondaryBtnText,
                  { color: showRejectInput ? '#ffffff' : (theme.danger || '#ef4444') }
                ]}
              >
                {showRejectInput ? 'Confirm Reject' : 'Reject Step'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)'
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '85%'
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150, 150, 150, 0.4)',
    alignSelf: 'center',
    marginBottom: 12
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1
  },
  kindBadgeText: {
    fontSize: 10,
    fontFamily: fontSemiBold,
    letterSpacing: 0.5
  },
  title: {
    fontSize: 18,
    fontFamily: fontSemiBold,
    marginBottom: 4
  },
  summary: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12
  },
  scrollArea: {
    maxHeight: 280,
    marginBottom: 16
  },
  section: {
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: fontSemiBold,
    letterSpacing: 0.6,
    marginBottom: 6
  },
  codeBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10
  },
  codeText: {
    fontSize: 12,
    fontFamily: fontMono,
    lineHeight: 17
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1
  },
  pathText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fontMono
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6
  },
  choiceIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  choiceIndexText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: fontSemiBold
  },
  choiceLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500'
  },
  rejectInputBox: {
    marginTop: 8
  },
  rejectInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 12
  },
  actionsCol: {
    gap: 8
  },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: fontSemiBold
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8
  },
  halfBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryBtnText: {
    fontSize: 12,
    fontFamily: fontSemiBold
  }
});
