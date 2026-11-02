import { Type, type Static } from "@sinclair/typebox";

const UuidSchema = Type.String({ format: "uuid" });
const DateSchema = Type.String({ format: "date" });
const DateTimeSchema = Type.String({ format: "date-time" });
const NullableString = Type.Union([Type.String(), Type.Null()]);
const ColorSchema = Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" });

export const MatchStatusSchema = Type.Union([
  Type.Literal("scheduled"),
  Type.Literal("to_be_scheduled"),
  Type.Literal("postponed"),
  Type.Literal("cancelled"),
  Type.Literal("completed"),
]);

export const CompetitionCategorySchema = Type.Union([
  Type.Literal("league"),
  Type.Literal("cup"),
  Type.Literal("tournament"),
  Type.Literal("friendly"),
  Type.Literal("other"),
]);

export const SeasonCreateRequestSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 80 }),
    startsOn: DateSchema,
    endsOn: DateSchema,
  },
  { additionalProperties: false },
);

export const SeasonSchema = Type.Object(
  {
    id: UuidSchema,
    label: Type.String(),
    startsOn: DateSchema,
    endsOn: DateSchema,
  },
  { additionalProperties: false },
);

export const AdminSeasonsSchema = Type.Array(SeasonSchema);

export const TeamConfigurationRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.Union([Type.String({ maxLength: 120 }), Type.Null()])),
    crestUrl: Type.Optional(Type.Union([Type.String({ maxLength: 2048 }), Type.Null()])),
    primaryColor: Type.Optional(Type.Union([ColorSchema, Type.Null()])),
    secondaryColor: Type.Optional(Type.Union([ColorSchema, Type.Null()])),
    currentSeasonId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const AdminTeamSchema = Type.Object(
  {
    id: Type.Literal(1),
    name: NullableString,
    crestUrl: NullableString,
    primaryColor: NullableString,
    secondaryColor: NullableString,
    currentSeasonId: Type.Union([UuidSchema, Type.Null()]),
    publishedAt: Type.Union([DateTimeSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const PublicTeamSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    crestUrl: Type.String({ minLength: 1 }),
    primaryColor: NullableString,
    secondaryColor: NullableString,
    currentSeason: Type.Union([SeasonSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const PlayerCreateRequestSchema = Type.Object(
  { displayName: Type.String({ minLength: 1, maxLength: 120 }) },
  { additionalProperties: false },
);

export const PlayerSchema = Type.Object(
  { id: UuidSchema, displayName: Type.String() },
  { additionalProperties: false },
);

export const AdminPlayersSchema = Type.Array(PlayerSchema);

export const RosterMembershipCreateRequestSchema = Type.Object(
  {
    playerId: UuidSchema,
    seasonId: UuidSchema,
    jerseyNumber: Type.Optional(Type.Union([Type.Integer({ minimum: 0, maximum: 99 }), Type.Null()])),
    activeFrom: DateSchema,
    activeUntil: Type.Optional(Type.Union([DateSchema, Type.Null()])),
  },
  { additionalProperties: false },
);

export const RosterMembershipSchema = Type.Object(
  {
    id: UuidSchema,
    playerId: UuidSchema,
    seasonId: UuidSchema,
    jerseyNumber: Type.Union([Type.Integer(), Type.Null()]),
    activeFrom: DateSchema,
    activeUntil: Type.Union([DateSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const AdminRosterMembershipsSchema = Type.Array(RosterMembershipSchema);

export const AdminRosterMembershipsQuerySchema = Type.Object(
  {
    seasonId: Type.Optional(UuidSchema),
    playerId: Type.Optional(UuidSchema),
  },
  { additionalProperties: false },
);

export const RosterMembershipEndRequestSchema = Type.Object(
  { activeUntil: DateSchema, reason: Type.Optional(Type.String({ maxLength: 500 })) },
  { additionalProperties: false },
);

export const PublicRosterSchema = Type.Object(
  {
    season: Type.Union([Type.Pick(SeasonSchema, ["id", "label"]), Type.Null()]),
    players: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          displayName: Type.String(),
          jerseyNumber: Type.Union([Type.Integer(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const OpponentCreateRequestSchema = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }) },
  { additionalProperties: false },
);

export const OpponentSchema = Type.Object(
  { id: UuidSchema, name: Type.String() },
  { additionalProperties: false },
);

export const AdminOpponentsSchema = Type.Array(OpponentSchema);

export const CompetitionCreateRequestSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    category: CompetitionCategorySchema,
    isOfficial: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const CompetitionSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String(),
    category: CompetitionCategorySchema,
    isOfficial: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const AdminCompetitionsSchema = Type.Array(CompetitionSchema);

export const MatchCreateRequestSchema = Type.Object(
  {
    seasonId: UuidSchema,
    opponentId: UuidSchema,
    competitionId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    isOfficial: Type.Boolean(),
    scheduledAt: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
    status: Type.Optional(MatchStatusSchema),
  },
  { additionalProperties: false },
);

export const MatchSchedulePatchRequestSchema = Type.Object(
  {
    scheduledAt: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
    status: Type.Optional(MatchStatusSchema),
    reason: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const MatchSchema = Type.Object(
  {
    id: UuidSchema,
    seasonId: UuidSchema,
    opponentId: UuidSchema,
    competitionId: Type.Union([UuidSchema, Type.Null()]),
    isOfficial: Type.Boolean(),
    scheduledAt: Type.Union([DateTimeSchema, Type.Null()]),
    status: MatchStatusSchema,
    publishedAt: Type.Union([DateTimeSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const AdminMatchesSchema = Type.Array(MatchSchema);

export const AdminMatchesQuerySchema = Type.Object(
  { seasonId: Type.Optional(UuidSchema) },
  { additionalProperties: false },
);

export const PublicMatchSchema = Type.Object(
  {
    id: UuidSchema,
    seasonId: UuidSchema,
    opponentName: Type.String(),
    competitionName: NullableString,
    isOfficial: Type.Boolean(),
    scheduledAt: Type.Union([DateTimeSchema, Type.Null()]),
    status: MatchStatusSchema,
  },
  { additionalProperties: false },
);

export const PublicMatchesSchema = Type.Object(
  {
    scheduled: Type.Array(PublicMatchSchema),
    toBeScheduled: Type.Array(PublicMatchSchema),
  },
  { additionalProperties: false },
);

export const ApiErrorSchema = Type.Object(
  { error: Type.String() },
  { additionalProperties: false },
);

export type SeasonCreateRequest = Static<typeof SeasonCreateRequestSchema>;
export type SeasonDto = Static<typeof SeasonSchema>;
export type AdminSeasonsDto = Static<typeof AdminSeasonsSchema>;
export type TeamConfigurationRequest = Static<typeof TeamConfigurationRequestSchema>;
export type AdminTeamDto = Static<typeof AdminTeamSchema>;
export type PublicTeamDto = Static<typeof PublicTeamSchema>;
export type PlayerCreateRequest = Static<typeof PlayerCreateRequestSchema>;
export type PlayerDto = Static<typeof PlayerSchema>;
export type AdminPlayersDto = Static<typeof AdminPlayersSchema>;
export type RosterMembershipCreateRequest = Static<typeof RosterMembershipCreateRequestSchema>;
export type RosterMembershipDto = Static<typeof RosterMembershipSchema>;
export type AdminRosterMembershipsDto = Static<typeof AdminRosterMembershipsSchema>;
export type AdminRosterMembershipsQuery = Static<typeof AdminRosterMembershipsQuerySchema>;
export type RosterMembershipEndRequest = Static<typeof RosterMembershipEndRequestSchema>;
export type PublicRosterDto = Static<typeof PublicRosterSchema>;
export type OpponentCreateRequest = Static<typeof OpponentCreateRequestSchema>;
export type OpponentDto = Static<typeof OpponentSchema>;
export type AdminOpponentsDto = Static<typeof AdminOpponentsSchema>;
export type CompetitionCreateRequest = Static<typeof CompetitionCreateRequestSchema>;
export type CompetitionDto = Static<typeof CompetitionSchema>;
export type AdminCompetitionsDto = Static<typeof AdminCompetitionsSchema>;
export type MatchCreateRequest = Static<typeof MatchCreateRequestSchema>;
export type MatchSchedulePatchRequest = Static<typeof MatchSchedulePatchRequestSchema>;
export type MatchDto = Static<typeof MatchSchema>;
export type AdminMatchesDto = Static<typeof AdminMatchesSchema>;
export type AdminMatchesQuery = Static<typeof AdminMatchesQuerySchema>;
export type PublicMatchDto = Static<typeof PublicMatchSchema>;
export type PublicMatchesDto = Static<typeof PublicMatchesSchema>;
export type MatchStatus = Static<typeof MatchStatusSchema>;
