CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actorId` int NOT NULL,
	`connectionId` int,
	`requestId` int,
	`eventType` varchar(80) NOT NULL,
	`status` varchar(40) NOT NULL,
	`metadata` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `databaseConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`createdById` int NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`host` varchar(255) NOT NULL,
	`port` int NOT NULL DEFAULT 5432,
	`databaseName` varchar(160) NOT NULL,
	`username` varchar(160) NOT NULL,
	`encryptedPassword` text NOT NULL,
	`sslMode` enum('require','prefer','disable') NOT NULL DEFAULT 'require',
	`status` enum('unknown','connected','failed','permission_denied','schema_unavailable') NOT NULL DEFAULT 'unknown',
	`lastError` text,
	`lastVerifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `databaseConnections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidenceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`evidenceType` enum('schema','result','execution','plan','error') NOT NULL,
	`payload` json NOT NULL,
	`provenance` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidenceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policyDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`decision` enum('allow','reject','clarification') NOT NULL,
	`riskClass` enum('safe_read','review_required','high_risk') NOT NULL,
	`reasons` json NOT NULL,
	`normalizedSql` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policyDecisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `queryExecutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`status` enum('success','timeout','failed','limit_reached') NOT NULL,
	`durationMs` int,
	`rowsReturned` int,
	`resultPreview` json,
	`errorCode` varchar(80),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `queryExecutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `queryRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`connectionId` int NOT NULL,
	`userId` int NOT NULL,
	`naturalLanguageRequest` text NOT NULL,
	`status` enum('created','proposed','blocked','ready','executing','completed','failed','clarification') NOT NULL DEFAULT 'created',
	`clarification` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `queryRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schemaSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connectionId` int NOT NULL,
	`tableCount` int NOT NULL DEFAULT 0,
	`columnCount` int NOT NULL DEFAULT 0,
	`relationshipCount` int NOT NULL DEFAULT 0,
	`metadata` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schemaSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sqlProposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`sqlText` text NOT NULL,
	`tables` json NOT NULL,
	`columns` json NOT NULL,
	`assumptions` json NOT NULL,
	`confidence` varchar(16) NOT NULL,
	`model` varchar(120),
	`promptVersion` varchar(32) NOT NULL DEFAULT 'v1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sqlProposals_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposal_request_unique` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `workspaceMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','viewer') NOT NULL DEFAULT 'viewer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspaceMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_membership_unique` UNIQUE(`workspaceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_workspace_idx` ON `auditEvents` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `audit_request_idx` ON `auditEvents` (`requestId`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `auditEvents` (`createdAt`);--> statement-breakpoint
CREATE INDEX `connection_workspace_idx` ON `databaseConnections` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `evidence_request_idx` ON `evidenceItems` (`requestId`);--> statement-breakpoint
CREATE INDEX `policy_request_idx` ON `policyDecisions` (`requestId`);--> statement-breakpoint
CREATE INDEX `execution_request_idx` ON `queryExecutions` (`requestId`);--> statement-breakpoint
CREATE INDEX `query_workspace_idx` ON `queryRequests` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `query_connection_idx` ON `queryRequests` (`connectionId`);--> statement-breakpoint
CREATE INDEX `snapshot_connection_idx` ON `schemaSnapshots` (`connectionId`);--> statement-breakpoint
CREATE INDEX `member_workspace_idx` ON `workspaceMembers` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `member_user_idx` ON `workspaceMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `workspace_owner_idx` ON `workspaces` (`ownerId`);