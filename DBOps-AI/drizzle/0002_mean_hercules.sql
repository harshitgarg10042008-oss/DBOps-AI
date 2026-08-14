CREATE TABLE `dataContracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`connectionId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`tableName` varchar(255) NOT NULL,
	`definition` json NOT NULL,
	`status` enum('active','paused') NOT NULL DEFAULT 'active',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dataContracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policyRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`maxRows` int NOT NULL DEFAULT 100,
	`allowedSchemas` json NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policyRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `contract_workspace_idx` ON `dataContracts` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `contract_connection_idx` ON `dataContracts` (`connectionId`);--> statement-breakpoint
CREATE INDEX `policy_workspace_idx` ON `policyRules` (`workspaceId`);