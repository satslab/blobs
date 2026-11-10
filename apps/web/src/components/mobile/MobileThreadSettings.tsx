import { selectableProviderOptionChoices } from "@satslab/client-runtime/model-traits";
import type {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderOptionDescriptor,
  RuntimeMode,
} from "@satslab/contracts";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ListFilterIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  useEnvironmentModelPreferences,
  useToggleEnvironmentModelFavorite,
} from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { providerModelKey } from "../../modelOrdering";
import {
  isProviderInstancePickerVisible,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import type { RuntimeModeOption } from "../chat/ComposerFooterControls";
import {
  resolveModelPickerSelectedModel,
  shouldIncludeModelPickerOption,
} from "../chat/ModelPickerContent";
import { rankModelPickerSearch } from "@satslab/client-runtime/model-search";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { getDisplayModelName, type ModelEsque } from "../chat/providerIconUtils";
import { type TraitsSelectionInput, useTraitsSelection } from "../chat/TraitsPicker";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";
import { Switch } from "../ui/switch";
import { followVisualViewport } from "./mobileLayout";
import { useDragToDismiss } from "./useDragToDismiss";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

type Page = { kind: "main" } | { kind: "option"; descriptorId: string } | { kind: "runtime" };

/** All providers, favorites only, or one provider. */
type ProviderFilter = "all" | "favorites" | ProviderInstanceId;

export interface MobileThreadSettingsProps {
  environmentId: EnvironmentId;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  activeInstanceId: ProviderInstanceId;
  model: string;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  getModelDisabledReason?: (instanceId: ProviderInstanceId, model: string) => string | null;
  onSelectModel: (instanceId: ProviderInstanceId, model: string) => void;
  traits: TraitsSelectionInput | null;
  /** The effort and speed summary the chip shows after the model name. */
  traitsLabel: string | null;
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The phone composer's model chip and the "Thread settings" sheet it opens, laid out like the
 * mobile app: providers as collapsible sections, the model's options, and search at the bottom.
 */
export function MobileThreadSettings(props: MobileThreadSettingsProps) {
  const activeEntry = props.instanceEntries.find(
    (entry) => entry.instanceId === props.activeInstanceId,
  );
  const activeModel = resolveModelPickerSelectedModel({
    driverKind: activeEntry?.driverKind,
    model: props.model,
    options: props.modelOptionsByInstance.get(props.activeInstanceId) ?? [],
  });
  const modelLabel = activeModel ? getDisplayModelName(activeModel) : props.model;
  return (
    <>
      <button
        type="button"
        aria-label={[modelLabel, props.traitsLabel].filter(Boolean).join(", ")}
        disabled={props.disabled}
        onClick={() => props.onOpenChange(true)}
        className="me-auto flex h-10 min-w-0 shrink items-center gap-1.5 rounded-xl px-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-64"
      >
        {activeEntry ? (
          <ProviderInstanceIcon
            driverKind={activeEntry.driverKind}
            displayName={activeEntry.displayName}
            accentColor={activeEntry.accentColor}
            acpRegistryAgentId={activeEntry.acpRegistryAgentId}
            acpRegistryIconUrl={activeEntry.acpRegistryIconUrl}
            className="size-5"
            iconClassName="size-5"
          />
        ) : null}
        {/* The one-row composer shows only the provider; a stacked one names the model. */}
        <span className="flex min-w-0 items-center gap-1.5 in-data-[composer-single-line]:hidden">
          <span className="truncate font-medium">{modelLabel}</span>
          {props.traitsLabel ? (
            <span className="truncate text-muted-foreground">{props.traitsLabel}</span>
          ) : null}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetPopup
          side="bottom"
          variant="rounded"
          showCloseButton={false}
          className="row-span-2 row-start-1 h-full"
          // Starts 7rem down (its viewport already insets it 3rem) and ends above an open keyboard.
          ref={(popup: HTMLDivElement | null) =>
            popup ? followVisualViewport(popup, 112, 48) : undefined
          }
        >
          {props.open ? (
            <ThreadSettingsContent {...props} onClose={() => props.onOpenChange(false)} />
          ) : null}
        </SheetPopup>
      </Sheet>
    </>
  );
}

function ThreadSettingsContent(props: MobileThreadSettingsProps & { onClose: () => void }) {
  const dragToDismiss = useDragToDismiss(props.onClose);
  // The title bar draws its border only once the list scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  const [page, setPage] = useState<Page>({ kind: "main" });
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [showLegacy, setShowLegacy] = useState(false);
  const { favorites } = useEnvironmentModelPreferences(props.environmentId);
  const toggleFavorite = useToggleEnvironmentModelFavorite(props.environmentId);
  const favoriteKeys = new Set(favorites.map((fav) => providerModelKey(fav.provider, fav.model)));
  const activeEntry = props.instanceEntries.find(
    (entry) => entry.instanceId === props.activeInstanceId,
  );
  const activeSlug =
    resolveModelPickerSelectedModel({
      driverKind: activeEntry?.driverKind,
      model: props.model,
      options: props.modelOptionsByInstance.get(props.activeInstanceId) ?? [],
    })?.slug ?? props.model;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set([props.activeInstanceId]),
  );
  const toggleSection = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const lockedOut = (entry: ProviderInstanceEntry) =>
    props.lockedProvider !== null &&
    (entry.driverKind !== props.lockedProvider ||
      (props.lockedContinuationGroupKey != null &&
        entry.continuationGroupKey !== props.lockedContinuationGroupKey));
  const entries = props.instanceEntries.filter(
    (entry) => isProviderInstancePickerVisible(entry) && !lockedOut(entry),
  );
  const modelsOf = (entry: ProviderInstanceEntry) =>
    (props.modelOptionsByInstance.get(entry.instanceId) ?? []).filter(
      (option) =>
        shouldIncludeModelPickerOption({
          entry,
          option,
          activeInstanceId: props.activeInstanceId,
          activeModel: activeSlug,
        }) &&
        (showLegacy ||
          !option.isLegacy ||
          favoriteKeys.has(providerModelKey(entry.instanceId, option.slug)) ||
          (entry.instanceId === props.activeInstanceId && option.slug === activeSlug)),
    );
  const allRows = entries.flatMap((entry) => modelsOf(entry).map((model) => ({ entry, model })));
  const favoriteRows = allRows.filter(({ entry, model }) =>
    favoriteKeys.has(providerModelKey(entry.instanceId, model.slug)),
  );
  const searchRows = query.trim()
    ? rankModelPickerSearch(allRows, query, ({ entry, model }) => ({
        name: model.name,
        ...(model.shortName ? { shortName: model.shortName } : {}),
        ...(model.subProvider ? { subProvider: model.subProvider } : {}),
        driverKind: entry.driverKind,
        providerDisplayName: entry.displayName,
        isFavorite: favoriteKeys.has(providerModelKey(entry.instanceId, model.slug)),
      }))
    : null;

  const row = ({ entry, model }: { entry: ProviderInstanceEntry; model: ModelEsque }) => {
    const disabledReason = props.getModelDisabledReason?.(entry.instanceId, model.slug) ?? null;
    const selected = entry.instanceId === props.activeInstanceId && model.slug === activeSlug;
    const favorite = favoriteKeys.has(providerModelKey(entry.instanceId, model.slug));
    return (
      <div key={`${entry.instanceId}:${model.slug}`} className="flex min-h-12 items-center">
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabledReason !== null}
          onClick={() => props.onSelectModel(entry.instanceId, model.slug)}
          className={cn(
            "flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 ps-4 text-left text-base outline-hidden focus-visible:bg-accent disabled:opacity-50",
            model.isUnavailable && "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{getDisplayModelName(model)}</span>
            {disabledReason ? (
              <span className="truncate text-sm text-muted-foreground">{disabledReason}</span>
            ) : null}
          </span>
          {model.isDefault ? (
            <span className="shrink-0 rounded-md bg-primary/12 px-1.5 py-0.5 text-xs font-medium text-primary">
              Default
            </span>
          ) : null}
          {selected ? <CheckIcon className="ms-auto size-4.5 shrink-0" /> : null}
        </button>
        <button
          type="button"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          onClick={() => void toggleFavorite(entry.instanceId, model.slug)}
          className="grid size-11 shrink-0 place-items-center text-primary outline-hidden focus-visible:bg-accent"
        >
          <StarIcon className={cn("size-4.5", favorite && "fill-current")} />
        </button>
      </div>
    );
  };

  const section = (
    key: string,
    label: string,
    icon: ReactNode,
    rows: ReadonlyArray<{ entry: ProviderInstanceEntry; model: ModelEsque }>,
  ) => {
    const open = expanded.has(key);
    return (
      <section key={key}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => toggleSection(key)}
          className="flex h-11 w-full items-center gap-3 px-1 text-base font-medium text-primary outline-hidden focus-visible:bg-accent"
        >
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {open ? null : <span className="text-sm text-muted-foreground">{rows.length}</span>}
          {open ? (
            <ChevronUpIcon className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          )}
        </button>
        {open ? <Group>{rows.map(row)}</Group> : null}
      </section>
    );
  };

  const shownEntries =
    providerFilter === "all" || providerFilter === "favorites"
      ? entries
      : entries.filter((entry) => entry.instanceId === providerFilter);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white dark:bg-card">
      <header
        {...dragToDismiss}
        className={cn(
          "absolute inset-x-0 top-0 z-10 grid touch-none grid-cols-[auto_1fr_auto] items-center gap-3 border-b bg-white/70 px-3 pt-4 pb-2 backdrop-blur-xl backdrop-saturate-150 transition-colors dark:bg-card/70",
          scrolled ? "border-border/70" : "border-transparent",
        )}
      >
        {/* Drag the title area down to dismiss. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/20"
        />
        {page.kind === "main" ? (
          <RoundButton label="Close" onClick={props.onClose}>
            <XIcon className="size-4.5" />
          </RoundButton>
        ) : (
          <RoundButton label="Back" onClick={() => setPage({ kind: "main" })}>
            <ChevronLeftIcon className="size-4.5" />
          </RoundButton>
        )}
        <div className="min-w-0 justify-self-center [&_h2]:truncate [&_h2]:text-base">
          <SheetTitle>Thread settings</SheetTitle>
        </div>
        <RoundButton label="Done" primary onClick={props.onClose}>
          <CheckIcon className="size-4.5" />
        </RoundButton>
      </header>

      {/* Scrolls under the glass title and search bars. */}
      <div
        onScroll={(event) => {
          const next = event.currentTarget.scrollTop > 0;
          if (next !== scrolled) setScrolled(next);
        }}
        className="bottom-chrome-fade min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="px-4 pt-19 pb-4">
          {page.kind === "runtime" ? (
            <Group>
              {props.runtimeModeOptions.map((option) => (
                <ChoiceRow
                  key={option.mode}
                  label={option.label}
                  description={option.description}
                  selected={option.mode === props.runtimeMode}
                  disabled={option.disabledReason !== undefined}
                  onPick={() => {
                    props.onRuntimeModeChange(option.mode);
                    setPage({ kind: "main" });
                  }}
                />
              ))}
            </Group>
          ) : page.kind === "option" && props.traits ? (
            <OptionChoices
              traits={props.traits}
              descriptorId={page.descriptorId}
              onDone={() => setPage({ kind: "main" })}
            />
          ) : searchRows ? (
            searchRows.length > 0 ? (
              <Group>{searchRows.map(row)}</Group>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No models found</p>
            )
          ) : (
            <>
              {providerFilter === "favorites" ||
              (providerFilter === "all" && favoriteRows.length > 0)
                ? section(
                    "favorites",
                    "Favorites",
                    <StarIcon className="size-5 fill-current" />,
                    favoriteRows,
                  )
                : null}
              {providerFilter === "favorites"
                ? null
                : shownEntries.map((entry) =>
                    section(
                      entry.instanceId,
                      entry.displayName,
                      <ProviderInstanceIcon
                        driverKind={entry.driverKind}
                        displayName={entry.displayName}
                        accentColor={entry.accentColor}
                        acpRegistryAgentId={entry.acpRegistryAgentId}
                        acpRegistryIconUrl={entry.acpRegistryIconUrl}
                        className="size-5"
                        iconClassName="size-5"
                      />,
                      modelsOf(entry).map((model) => ({ entry, model })),
                    ),
                  )}
              <h3 className="px-1 pt-4 pb-2 text-base font-medium text-primary">Options</h3>
              <Group>
                {props.traits ? (
                  <TraitRows
                    traits={props.traits}
                    onOpenOption={(descriptorId) => setPage({ kind: "option", descriptorId })}
                  />
                ) : null}
                <NavRow
                  label="Runtime"
                  value={
                    props.runtimeModeOptions.find((option) => option.mode === props.runtimeMode)
                      ?.label ?? ""
                  }
                  onClick={() => setPage({ kind: "runtime" })}
                />
              </Group>
            </>
          )}
          {page.kind === "main" ? (
            <div aria-hidden className="pb-safe">
              <div className="h-20" />
            </div>
          ) : (
            <div aria-hidden className="pb-safe" />
          )}
        </div>
      </div>

      {page.kind === "main" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 *:pointer-events-auto">
          <div className="flex items-center gap-3 px-4 pt-3 pb-3 pb-safe in-data-[keyboard-open]:pb-3!">
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Model filters"
                    className={cn(
                      "glass-float grid size-11 shrink-0 place-items-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      (providerFilter !== "all" || showLegacy) && "bg-foreground text-background",
                    )}
                  />
                }
              >
                <ListFilterIcon className="size-4.5" />
              </MenuTrigger>
              <MenuPopup side="top" align="start">
                <MenuGroup>
                  <MenuGroupLabel>Provider</MenuGroupLabel>
                  <MenuRadioGroup
                    value={providerFilter}
                    onValueChange={(value: ProviderFilter) => setProviderFilter(value)}
                  >
                    <MenuRadioItem value="all" closeOnClick>
                      All providers
                    </MenuRadioItem>
                    <MenuRadioItem value="favorites" closeOnClick>
                      Favorites
                    </MenuRadioItem>
                    {entries.map((entry) => (
                      <MenuRadioItem key={entry.instanceId} value={entry.instanceId} closeOnClick>
                        {entry.displayName}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuGroup>
                <MenuCheckboxItem checked={showLegacy} onCheckedChange={setShowLegacy}>
                  Show legacy models
                </MenuCheckboxItem>
              </MenuPopup>
            </Menu>
            <label className="glass-float flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4">
              <SearchIcon className="size-4.5 shrink-0 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Find a model"
                aria-label="Find a model"
                className="min-w-0 flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground"
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The selected model's options: each select opens its own page, each switch toggles in place. */
function TraitRows(props: {
  traits: TraitsSelectionInput;
  onOpenOption: (descriptorId: string) => void;
}) {
  const traits = useTraitsSelection(props.traits);
  if (traits.modelIsUnavailable) return null;
  return (
    <>
      {traits.selectDescriptors.map((descriptor) => (
        <NavRow
          key={descriptor.id}
          label={descriptor.label}
          value={currentChoiceLabel(descriptor, traits.selectValue(descriptor))}
          onClick={() => props.onOpenOption(descriptor.id)}
        />
      ))}
      {traits.booleanDescriptors.map((descriptor) => (
        <label key={descriptor.id} className="flex min-h-12 items-center gap-3 px-4 text-base">
          <span className="min-w-0 flex-1 truncate">{descriptor.label}</span>
          <Switch
            checked={descriptor.currentValue === true}
            onCheckedChange={(next) => traits.changeBoolean(descriptor.id, next)}
            aria-label={descriptor.label}
          />
        </label>
      ))}
    </>
  );
}

function currentChoiceLabel(descriptor: SelectDescriptor, value: string | undefined) {
  return (
    selectableProviderOptionChoices(descriptor).find((choice) => choice.id === value)?.label ?? ""
  );
}

function OptionChoices(props: {
  traits: TraitsSelectionInput;
  descriptorId: string;
  onDone: () => void;
}) {
  const traits = useTraitsSelection(props.traits);
  const descriptor = traits.selectDescriptors.find((item) => item.id === props.descriptorId);
  if (!descriptor) return null;
  const value = traits.selectValue(descriptor);
  return (
    <>
      <h3 className="px-1 pb-2 text-base font-medium text-primary">{descriptor.label}</h3>
      <Group>
        {selectableProviderOptionChoices(descriptor).map((choice) => (
          <ChoiceRow
            key={choice.id}
            label={choice.label}
            description={choice.description}
            isDefault={choice.isDefault}
            selected={choice.id === value}
            onPick={() => {
              traits.changeSelect(descriptor, choice.id);
              props.onDone();
            }}
          />
        ))}
      </Group>
    </>
  );
}

function Group({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-muted">{children}</div>
  );
}

function NavRow(props: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-base outline-hidden focus-visible:bg-accent"
    >
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <span className="truncate text-primary">{props.value}</span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ChoiceRow(props: {
  label: string;
  description?: string | undefined;
  isDefault?: boolean | undefined;
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      disabled={props.disabled}
      onClick={props.onPick}
      className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left outline-hidden focus-visible:bg-accent disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-base">
          {props.label}
          {props.isDefault ? (
            <span className="rounded-md bg-primary/12 px-1.5 py-0.5 text-xs font-medium text-primary">
              Default
            </span>
          ) : null}
        </span>
        {props.description ? (
          <span className="text-sm text-muted-foreground">{props.description}</span>
        ) : null}
      </span>
      {props.selected ? <CheckIcon className="size-5 shrink-0" /> : null}
    </button>
  );
}

function RoundButton(props: {
  label: string;
  primary?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "glass-float",
        // Tinted glass, so the confirm button floats like the others.
        props.primary && "bg-primary/85! text-primary-foreground",
      )}
    >
      {props.children}
    </button>
  );
}
