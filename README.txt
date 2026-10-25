EPF update merged with the Aurafin fixes (Buy/Sell validation + lint fix in Wealth.tsx).
NOT compiled: it needs the rest of your newer project (types, utils/ppf, utils/property,
utils/id, PpfSection, PropertySection, AssetFormExtras). Drop these two files into your
latest project, or upload that project and I will merge everything and verify the build.

UPDATE: Back button moved to the left of "Edit Asset"; long helper texts moved into an "i" popover
(new src/components/ui/InfoTip.tsx; Field/FieldGroup accept a `hint` prop).
Still to convert (files not included here): PpfSection, PropertySection, AssetFormExtras, Performance page.

UPDATE 2: Edit Liability is now a full page (like Edit Asset) with a left-side back arrow ("Back to Liabilities");
the Add Asset/Liability flow's back button is also on the left and follows the Asset/Liability toggle.
