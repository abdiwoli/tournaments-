import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import {
  ChevronUp,
  ChevronDown,
  Search,
  Trophy,
  X,
  Filter,
} from "lucide-react-native";
import TeamAvatar from "@/components/team/TeamAvatar";

const TIE_BREAKERS = {
  goals: ["computedGoals", "computedAssists", "computedMotm"],
  assists: ["computedAssists", "computedGoals", "computedMotm"],
  motm: ["computedMotm", "computedGoals", "computedAssists"],
  yc: ["yellowCards", "redCards", "computedGoals"],
  rc: ["redCards", "yellowCards", "computedGoals"],
  matches: ["matchesPlayed", "computedGoals", "computedAssists"],
};

const SORT_OPTIONS = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "motm", label: "MOTM" },
  { key: "yc", label: "Yellow Cards" },
  { key: "rc", label: "Red Cards" },
  { key: "matches", label: "Matches Played" },
];

export default function PlayerRankingsTable({
  players = [],
  teamById = {},
  matches = [],
  goals = [],
  appearances = [],
  onPlayerPress, // Navigation callback e.g. (playerId) => navigation.navigate('PlayerDetail', { id: playerId })
}) {
  const [selectedRounds, setSelectedRounds] = useState([]); // Empty = All Rounds
  const [isRoundModalOpen, setIsRoundModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("all");
  const [sortKey, setSortKey] = useState("goals");
  const [sortDir, setSortDir] = useState("desc");
  const [query, setQuery] = useState("");

  // Unique sorted list of available round numbers
  const availableRounds = useMemo(() => {
    const rounds = new Set();
    matches.forEach((m) => {
      if (m.round !== undefined && m.round !== null && m.round !== "") {
        rounds.add(Number(m.round));
      }
    });
    return Array.from(rounds).sort((a, b) => a - b);
  }, [matches]);

  const finalizedMatches = useMemo(
    () =>
      matches
        .filter((m) => m.status === "completed" || m.status === "closed")
        .sort(
          (a, b) =>
            (b.round || 0) - (a.round || 0) ||
            new Date(b.scheduled_at || b.created_date || 0) -
              new Date(a.scheduled_at || a.created_date || 0)
        ),
    [matches]
  );

  const closedMatchIds = useMemo(
    () => new Set(matches.filter((m) => m.status === "closed").map((m) => m.id)),
    [matches]
  );
  const completedMatchIds = useMemo(
    () => new Set(matches.filter((m) => m.status === "completed").map((m) => m.id)),
    [matches]
  );

  // Compute active match IDs matching selected multi-rounds
  const activeMatchIds = useMemo(() => {
    let matchesSubset = finalizedMatches;

    if (selectedRounds.length > 0) {
      matchesSubset = matchesSubset.filter((m) =>
        selectedRounds.includes(Number(m.round))
      );
    }

    return new Set(matchesSubset.map((m) => m.id));
  }, [finalizedMatches, selectedRounds]);

  const toggleRound = (roundNum) => {
    setSelectedRounds((prev) =>
      prev.includes(roundNum)
        ? prev.filter((r) => r !== roundNum)
        : [...prev, roundNum]
    );
  };

  const handleSelectAllRounds = () => {
    if (selectedRounds.length === availableRounds.length) {
      setSelectedRounds([]);
    } else {
      setSelectedRounds([...availableRounds]);
    }
  };

  const rows = useMemo(() => {
    return players.map((p) => {
      const inActiveMatches = (mid) => activeMatchIds.has(mid);

      const myAppearances = appearances.filter(
        (a) =>
          a.player_id === p.id &&
          closedMatchIds.has(a.match_id) &&
          inActiveMatches(a.match_id)
      );

      const myEvents = goals.filter(
        (g) =>
          g.player_id === p.id &&
          completedMatchIds.has(g.match_id) &&
          inActiveMatches(g.match_id)
      );

      const goalsCount =
        myAppearances.reduce((s, a) => s + (a.goals || 0), 0) +
        myEvents.reduce((s, g) => s + (g.count ?? 1), 0);

      const assistsCount =
        myAppearances.reduce((s, a) => s + (a.assists || 0), 0) +
        myEvents.reduce((s, g) => s + (g.assists || 0), 0);

      const yellowCards =
        myAppearances.reduce((s, a) => s + (a.yellow_cards || 0), 0) +
        myEvents.reduce((s, g) => s + (g.yellow_cards || 0), 0);

      const redCards =
        myAppearances.reduce((s, a) => s + (a.red_cards || 0), 0) +
        myEvents.reduce((s, g) => s + (g.red_cards || 0), 0);

      const playedMatchIds = new Set([
        ...myAppearances.map((a) => a.match_id),
        ...myEvents.map((g) => g.match_id),
      ]);
      const matchesPlayed = playedMatchIds.size;

      // Deduplicate MOTM across both data sources per match
      const motmMatchIds = new Set([
        ...myAppearances.filter((a) => a.motm).map((a) => a.match_id),
        ...finalizedMatches
          .filter(
            (m) => activeMatchIds.has(m.id) && m.motm_player_id === p.id
          )
          .map((m) => m.id),
      ]);
      const motmCount = motmMatchIds.size;

      return {
        ...p,
        team: teamById[p.team_id],
        computedGoals: goalsCount,
        computedAssists: assistsCount,
        computedMotm: motmCount,
        yellowCards,
        redCards,
        matchesPlayed,
      };
    });
  }, [
    players,
    teamById,
    goals,
    appearances,
    activeMatchIds,
    closedMatchIds,
    completedMatchIds,
    finalizedMatches,
  ]);

  // Unique list of available teams sorted alphabetically
  const availableTeams = useMemo(() => {
    if (Object.keys(teamById).length > 0) {
      return Object.values(teamById).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
    }
    const teamMap = new Map();
    rows.forEach((r) => {
      if (r.team_id && r.team) teamMap.set(r.team_id, r.team);
    });
    return Array.from(teamMap.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  }, [teamById, rows]);

  // Apply Team and Query filtering
  const filtered = useMemo(() => {
    let result = rows;

    if (selectedTeamId && selectedTeamId !== "all") {
      result = result.filter(
        (p) => String(p.team_id) === String(selectedTeamId)
      );
    }

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.team?.name?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [rows, selectedTeamId, query]);

  const sorted = useMemo(() => {
    const chain = TIE_BREAKERS[sortKey] || ["computedGoals"];
    const dirMul = sortDir === "desc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const primary = chain[0];
      const primaryDiff = ((b[primary] || 0) - (a[primary] || 0)) * dirMul;
      if (primaryDiff !== 0) return primaryDiff;
      for (let i = 1; i < chain.length; i++) {
        const diff = (b[chain[i]] || 0) - (a[chain[i]] || 0);
        if (diff !== 0) return diff;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [filtered, sortKey, sortDir]);

  const allRoundsSelected =
    availableRounds.length > 0 &&
    (selectedRounds.length === 0 ||
      selectedRounds.length === availableRounds.length);

  const selectedTeamName =
    selectedTeamId === "all"
      ? "All Teams"
      : availableTeams.find((t) => String(t.id) === String(selectedTeamId))?.name ||
        "All Teams";

  const selectedSortOption = SORT_OPTIONS.find((s) => s.key === sortKey);

  const renderPlayerCard = ({ item: p, index: i }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPlayerPress && onPlayerPress(p.id)}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.rankText}>{i + 1}</Text>
        {p.team && <TeamAvatar team={p.team} size={32} />}
        <View style={styles.playerInfo}>
          <Text style={styles.playerName} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {p.team?.name || "—"} {p.position ? `• ${p.position}` : ""}
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>G</Text>
          <Text style={[styles.statValue, styles.textGreen]}>
            {p.computedGoals}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>A</Text>
          <Text style={[styles.statValue, styles.textBlue]}>
            {p.computedAssists}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>MOTM</Text>
          <Text style={[styles.statValue, styles.textAmber]}>
            {p.computedMotm}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Y</Text>
          <Text style={[styles.statValue, styles.textYellow]}>
            {p.yellowCards}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>R</Text>
          <Text style={[styles.statValue, styles.textRed]}>
            {p.redCards}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>MP</Text>
          <Text style={[styles.statValue, styles.textMuted]}>
            {p.matchesPlayed}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Controls Header */}
      <View style={styles.controlsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {/* Round Selection Modal Trigger */}
          <TouchableOpacity
            style={styles.pillButton}
            onPress={() => setIsRoundModalOpen(true)}
          >
            <Filter size={14} color="#6B7280" />
            <Text style={styles.pillText}>
              {allRoundsSelected
                ? "All Rounds"
                : selectedRounds.length === 1
                ? `Round ${selectedRounds[0]}`
                : `${selectedRounds.length} Rounds`}
            </Text>
            <ChevronDown size={14} color="#6B7280" />
          </TouchableOpacity>

          {/* Team Filter Modal Trigger */}
          <TouchableOpacity
            style={styles.pillButton}
            onPress={() => setIsTeamModalOpen(true)}
          >
            <Text style={styles.pillText}>{selectedTeamName}</Text>
            <ChevronDown size={14} color="#6B7280" />
          </TouchableOpacity>

          {/* Sort Selector Modal Trigger */}
          <TouchableOpacity
            style={styles.pillButton}
            onPress={() => setIsSortModalOpen(true)}
          >
            <Text style={styles.pillText}>Sort: {selectedSortOption?.label}</Text>
            <ChevronDown size={14} color="#6B7280" />
          </TouchableOpacity>

          {/* Toggle Direction Button */}
          <TouchableOpacity
            style={styles.iconCircleButton}
            onPress={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          >
            {sortDir === "desc" ? (
              <ChevronDown size={16} color="#374151" />
            ) : (
              <ChevronUp size={16} color="#374151" />
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Search size={16} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search players or teams..."
          placeholderTextColor="#9CA3AF"
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} style={styles.clearIcon}>
            <X size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Main List */}
      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPlayerCard}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {query
                ? "No players match your search."
                : selectedTeamId !== "all"
                ? "No players found for the selected team."
                : selectedRounds.length > 0
                ? `No stats recorded for Round(s) ${selectedRounds.join(", ")}.`
                : "No players yet."}
            </Text>
          </View>
        }
      />

      {/* Modal: Filter Rounds */}
      <Modal visible={isRoundModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Rounds</Text>
              <TouchableOpacity onPress={() => setIsRoundModalOpen(false)}>
                <X size={20} color="#374151" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleSelectAllRounds}>
                <Text style={styles.actionText}>
                  {selectedRounds.length === availableRounds.length
                    ? "Deselect All"
                    : "Select All"}
                </Text>
              </TouchableOpacity>
              {selectedRounds.length > 0 && (
                <TouchableOpacity onPress={() => setSelectedRounds([])}>
                  <Text style={styles.actionTextMuted}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.roundGrid}>
              <View style={styles.roundGridContainer}>
                <TouchableOpacity
                  style={[
                    styles.roundPill,
                    selectedRounds.length === 0 && styles.roundPillActive,
                  ]}
                  onPress={() => setSelectedRounds([])}
                >
                  <Text
                    style={[
                      styles.roundPillText,
                      selectedRounds.length === 0 && styles.roundPillTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>

                {availableRounds.map((r) => {
                  const isSelected = selectedRounds.includes(r);
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.roundPill,
                        isSelected && styles.roundPillActive,
                      ]}
                      onPress={() => toggleRound(r)}
                    >
                      <Text
                        style={[
                          styles.roundPillText,
                          isSelected && styles.roundPillTextActive,
                        ]}
                      >
                        R{r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Team Filter */}
      <Modal visible={isTeamModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Team</Text>
              <TouchableOpacity onPress={() => setIsTeamModalOpen(false)}>
                <X size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setSelectedTeamId("all");
                  setIsTeamModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedTeamId === "all" && styles.optionTextActive,
                  ]}
                >
                  All Teams
                </Text>
              </TouchableOpacity>
              {availableTeams.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.optionRow}
                  onPress={() => {
                    setSelectedTeamId(String(t.id));
                    setIsTeamModalOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      String(selectedTeamId) === String(t.id) &&
                        styles.optionTextActive,
                    ]}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Sort Key */}
      <Modal visible={isSortModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort By</Text>
              <TouchableOpacity onPress={() => setIsSortModalOpen(false)}>
                <X size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {SORT_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={styles.optionRow}
                  onPress={() => {
                    setSortKey(o.key);
                    setSortDir("desc");
                    setIsSortModalOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      sortKey === o.key && styles.optionTextActive,
                    ]}
                  >
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  controlsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    gap: 6,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  iconCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    position: "relative",
    marginHorizontal: 16,
    marginBottom: 10,
    justifyContent: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    zIndex: 1,
  },
  clearIcon: {
    position: "absolute",
    right: 12,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    paddingVertical: 8,
    paddingLeft: 36,
    paddingRight: 36,
    fontSize: 14,
    color: "#111827",
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rankText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    width: 16,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  teamName: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  statCol: {
    alignItems: "center",
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  textGreen: { color: "#16A34A" },
  textBlue: { color: "#2563EB" },
  textAmber: { color: "#D97706" },
  textYellow: { color: "#CA8A04" },
  textRed: { color: "#DC2626" },
  textMuted: { color: "#6B7280" },

  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  actionText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "500",
  },
  actionTextMuted: {
    fontSize: 13,
    color: "#6B7280",
  },
  roundGrid: {
    maxHeight: 200,
  },
  roundGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roundPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  roundPillActive: {
    backgroundColor: "#2563EB",
  },
  roundPillText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  roundPillTextActive: {
    color: "#FFFFFF",
  },
  optionRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  optionText: {
    fontSize: 15,
    color: "#374151",
  },
  optionTextActive: {
    fontWeight: "600",
    color: "#2563EB",
  },
});