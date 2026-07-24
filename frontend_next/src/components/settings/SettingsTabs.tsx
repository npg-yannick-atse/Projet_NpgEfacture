"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "./UsersTab";
import { RolesTab } from "./RolesTab";
import { InvoiceTypesTab } from "./InvoiceTypesTab";
import { PointsOfSaleTab } from "./PointsOfSaleTab";

export function SettingsTabs() {
  return (
    <Tabs defaultValue="users">
      <TabsList>
        <TabsTrigger value="users">Utilisateurs</TabsTrigger>
        <TabsTrigger value="roles">Rôles & permissions</TabsTrigger>
        <TabsTrigger value="invoice-types">Types de factures</TabsTrigger>
        <TabsTrigger value="pos">Points de vente</TabsTrigger>
      </TabsList>

      <TabsContent value="users">
        <UsersTab />
      </TabsContent>
      <TabsContent value="roles">
        <RolesTab />
      </TabsContent>
      <TabsContent value="invoice-types">
        <InvoiceTypesTab />
      </TabsContent>
      <TabsContent value="pos">
        <PointsOfSaleTab />
      </TabsContent>
    </Tabs>
  );
}
