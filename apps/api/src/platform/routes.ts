import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  AdminTeamSchema,
  ApiErrorSchema,
  CompetitionCreateRequestSchema,
  CompetitionSchema,
  MatchCreateRequestSchema,
  MatchSchedulePatchRequestSchema,
  MatchSchema,
  OpponentCreateRequestSchema,
  OpponentSchema,
  PlayerCreateRequestSchema,
  PlayerSchema,
  PublicMatchesSchema,
  PublicRosterSchema,
  PublicTeamSchema,
  RosterMembershipCreateRequestSchema,
  RosterMembershipEndRequestSchema,
  RosterMembershipSchema,
  SeasonCreateRequestSchema,
  SeasonSchema,
  TeamConfigurationRequestSchema,
} from "@myteam/contracts";
import type {
  CompetitionCreateRequest,
  MatchCreateRequest,
  MatchSchedulePatchRequest,
  OpponentCreateRequest,
  PlayerCreateRequest,
  RosterMembershipCreateRequest,
  RosterMembershipEndRequest,
  SeasonCreateRequest,
  TeamConfigurationRequest,
} from "@myteam/contracts";
import { DomainError } from "./errors.js";
import type { AdminActor, AdminTokenVerifier } from "./auth.js";
import { PlatformService } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    adminActor: AdminActor | null;
  }
}

const errorResponses = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  500: ApiErrorSchema,
  503: ApiErrorSchema,
};

export function registerPlatformRoutes(
  app: FastifyInstance,
  pool: Pool,
  verifyAdminToken?: AdminTokenVerifier,
): void {
  const service = new PlatformService(pool);
  app.decorateRequest("adminActor", null);

  app.register(
    async (admin) => {
      admin.addHook("preHandler", async (request: FastifyRequest) => {
        if (!verifyAdminToken) throw new DomainError(503, "admin_auth_not_configured");
        request.adminActor = await verifyAdminToken(request.headers.authorization);
      });

      admin.get(
        "/team",
        {
          schema: {
            response: {
              200: { anyOf: [AdminTeamSchema, { type: "null" }] },
              ...errorResponses,
            },
          },
        },
        async () => service.getAdminTeam(),
      );

      admin.put<{ Body: TeamConfigurationRequest }>(
        "/team",
        {
          schema: {
            body: TeamConfigurationRequestSchema,
            response: { 200: AdminTeamSchema, ...errorResponses },
          },
        },
        async (request) => service.configureTeam(request.body, requireActor(request)),
      );

      admin.post(
        "/team/publish",
        { schema: { response: { 200: AdminTeamSchema, ...errorResponses } } },
        async (request) => service.publishTeam(requireActor(request)),
      );

      admin.post<{ Body: SeasonCreateRequest }>(
        "/seasons",
        {
          schema: {
            body: SeasonCreateRequestSchema,
            response: { 201: SeasonSchema, ...errorResponses },
          },
        },
        async (request, reply) => reply.code(201).send(await service.createSeason(request.body, requireActor(request))),
      );

      admin.post<{ Body: PlayerCreateRequest }>(
        "/players",
        {
          schema: {
            body: PlayerCreateRequestSchema,
            response: { 201: PlayerSchema, ...errorResponses },
          },
        },
        async (request, reply) => reply.code(201).send(await service.createPlayer(request.body, requireActor(request))),
      );

      admin.post<{ Body: RosterMembershipCreateRequest }>(
        "/roster-memberships",
        {
          schema: {
            body: RosterMembershipCreateRequestSchema,
            response: { 201: RosterMembershipSchema, ...errorResponses },
          },
        },
        async (request, reply) =>
          reply.code(201).send(await service.createRosterMembership(request.body, requireActor(request))),
      );

      admin.post<{ Params: { id: string }; Body: RosterMembershipEndRequest }>(
        "/roster-memberships/:id/end",
        {
          schema: {
            params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
            body: RosterMembershipEndRequestSchema,
            response: { 200: RosterMembershipSchema, ...errorResponses },
          },
        },
        async (request) => service.endRosterMembership(request.params.id, request.body, requireActor(request)),
      );

      admin.post<{ Body: OpponentCreateRequest }>(
        "/opponents",
        {
          schema: {
            body: OpponentCreateRequestSchema,
            response: { 201: OpponentSchema, ...errorResponses },
          },
        },
        async (request, reply) => reply.code(201).send(await service.createOpponent(request.body, requireActor(request))),
      );

      admin.post<{ Body: CompetitionCreateRequest }>(
        "/competitions",
        {
          schema: {
            body: CompetitionCreateRequestSchema,
            response: { 201: CompetitionSchema, ...errorResponses },
          },
        },
        async (request, reply) =>
          reply.code(201).send(await service.createCompetition(request.body, requireActor(request))),
      );

      admin.post<{ Body: MatchCreateRequest }>(
        "/matches",
        {
          schema: {
            body: MatchCreateRequestSchema,
            response: { 201: MatchSchema, ...errorResponses },
          },
        },
        async (request, reply) => reply.code(201).send(await service.createMatch(request.body, requireActor(request))),
      );

      admin.patch<{ Params: { id: string }; Body: MatchSchedulePatchRequest }>(
        "/matches/:id/schedule",
        {
          schema: {
            params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
            body: MatchSchedulePatchRequestSchema,
            response: { 200: MatchSchema, ...errorResponses },
          },
        },
        async (request) => service.updateMatchSchedule(request.params.id, request.body, requireActor(request)),
      );

      admin.post<{ Params: { id: string } }>(
        "/matches/:id/publish",
        {
          schema: {
            params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
            response: { 200: MatchSchema, ...errorResponses },
          },
        },
        async (request) => service.publishMatch(request.params.id, requireActor(request)),
      );
    },
    { prefix: "/api/v1/admin" },
  );

  app.get(
    "/api/v1/public/team",
    { schema: { response: { 200: PublicTeamSchema, ...errorResponses } } },
    async () => service.getPublicTeam(),
  );

  app.get(
    "/api/v1/public/roster",
    { schema: { response: { 200: PublicRosterSchema, ...errorResponses } } },
    async () => service.getPublicRoster(),
  );

  app.get(
    "/api/v1/public/matches",
    { schema: { response: { 200: PublicMatchesSchema, ...errorResponses } } },
    async () => service.getPublicMatches(),
  );
}

function requireActor(request: FastifyRequest): AdminActor {
  if (!request.adminActor) throw new DomainError(401, "authentication_required");
  return request.adminActor;
}
