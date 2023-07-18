/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {
  Dialog,
  Layout,
  NUX,
  styled,
  theme,
  useMemoize,
  useTrackedCallback,
  useValue,
  withTrackingScope,
} from 'flipper-plugin';
import {getRenderHostInstance} from 'flipper-frontend-core';
import React, {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {useDispatch, useStore} from '../utils/useStore';
import config from '../fb-stubs/config';
import {isConnected, currentUser, logoutUser} from '../fb-stubs/user';
import {showLoginDialog} from '../chrome/fb-stubs/SignInSheet';
import {Avatar, Badge, Button, Menu, Modal, Popover, Tooltip} from 'antd';
import {
  ApiOutlined,
  AppstoreAddOutlined,
  BellOutlined,
  BugOutlined,
  CameraOutlined,
  FileExclamationOutlined,
  LayoutOutlined,
  LoginOutlined,
  MedicineBoxOutlined,
  MobileOutlined,
  RocketOutlined,
  SettingOutlined,
  VideoCameraOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  toggleLeftSidebarVisible,
  toggleRightSidebarVisible,
} from '../reducers/application';
import {ToplevelProps} from './SandyApp';
import PluginManager from '../chrome/plugin-manager/PluginManager';
import {showEmulatorLauncher} from './appinspect/LaunchEmulator';
import SetupDoctorScreen, {checkHasNewProblem} from './SetupDoctorScreen';
import {isProduction} from 'flipper-common';
import FpsGraph from '../chrome/FpsGraph';
import NetworkGraph from '../chrome/NetworkGraph';
import {errorCounterAtom} from '../chrome/ConsoleLogs';
import {filterNotifications} from './notification/notificationUtils';
import {
  canFileExport,
  canOpenDialog,
  exportEverythingEverywhereAllAtOnce,
  ExportEverythingEverywhereAllAtOnceStatus,
  showOpenDialog,
  startFileExport,
  startLinkExport,
} from '../utils/exportData';
import UpdateIndicator from '../chrome/UpdateIndicator';
import {css} from '@emotion/css';
import constants from '../fb-stubs/constants';
import {setStaticView} from '../reducers/connections';
import {StyleGuide} from './StyleGuide';
import {openDeeplinkDialog} from '../deeplink';
import SettingsSheet from '../chrome/SettingsSheet';
import WelcomeScreen from './WelcomeScreen';

export const Navbar = withTrackingScope(function Navbar({
  toplevelSelection,
  setToplevelSelection,
}: ToplevelProps) {
  return (
    <Layout.Horizontal
      borderBottom
      style={{
        width: '100%',
        height: 68,
        padding: `${theme.space.small}px ${theme.space.large}px`,
        alignItems: 'center',
        justifyContent: 'space-between',
        background: theme.backgroundDefault,
      }}>
      <Layout.Horizontal style={{gap: 6}}>
        <LeftSidebarToggleButton />
        <NavbarButton
          icon={MobileOutlined}
          label="App Inspect"
          toggled={toplevelSelection === 'appinspect'}
          onClick={() => {
            setToplevelSelection('appinspect');
          }}
        />
        <button>device picker</button>
        <NavbarButton label="Screenshot" icon={CameraOutlined} />
        <NavbarButton label="Record" icon={VideoCameraOutlined} />
        <LaunchEmulatorButton />
        {getRenderHostInstance().GK('flipper_connection_troubleshoot') && (
          <ConnectionTroubleshootButton
            toplevelSelection={toplevelSelection}
            setToplevelSelection={setToplevelSelection}
          />
        )}
        {!isProduction() && (
          <div>
            <FpsGraph />
            <NetworkGraph />
          </div>
        )}
      </Layout.Horizontal>
      <Layout.Horizontal style={{gap: 6, alignItems: 'center'}}>
        <NavbarButton
          label="Add Plugins"
          icon={AppstoreAddOutlined}
          onClick={() => {
            Dialog.showModal((onHide) => <PluginManager onHide={onHide} />);
          }}
        />
        <DebugLogsButton
          toplevelSelection={toplevelSelection}
          setToplevelSelection={setToplevelSelection}
        />
        <NotificationButton
          toplevelSelection={toplevelSelection}
          setToplevelSelection={setToplevelSelection}
        />
        <ExtrasMenu />
        <SetupDoctorButton />
        <ExportEverythingEverywhereAllAtOnceButton />
        <RightSidebarToggleButton />
        {config.showLogin && <LoginConnectivityButton />}
        <UpdateIndicator />
      </Layout.Horizontal>
    </Layout.Horizontal>
  );
});

function ExportEverythingEverywhereAllAtOnceButton() {
  const store = useStore();
  const [status, setStatus] = useState<
    ExportEverythingEverywhereAllAtOnceStatus | undefined
  >();

  const exportEverythingEverywhereAllAtOnceTracked = useTrackedCallback(
    'Debug data export',
    () =>
      exportEverythingEverywhereAllAtOnce(
        store,
        (...args) => setStatus(args),
        config.isFBBuild,
      ),
    [store, setStatus],
  );

  return (
    <>
      <ExportEverythingEverywhereAllAtOnceStatusModal
        status={status}
        setStatus={setStatus}
      />
      <NUX title="Press this button if you have issues with Flipper. It will collect Flipper debug data that you can send to the Flipper team to get help.">
        <NavbarButton
          icon={BugOutlined}
          label="Rage"
          onClick={() => {
            exportEverythingEverywhereAllAtOnceTracked();
          }}
        />
      </NUX>
    </>
  );
}
function ExportEverythingEverywhereAllAtOnceStatusModal({
  status,
  setStatus,
}: {
  status: ExportEverythingEverywhereAllAtOnceStatus | undefined;
  setStatus: (
    newStatus: ExportEverythingEverywhereAllAtOnceStatus | undefined,
  ) => void;
}) {
  const [statusMessage, setStatusMessage] = useState<JSX.Element | undefined>();

  useEffect(() => {
    switch (status?.[0]) {
      case 'logs': {
        setStatusMessage(<p>Exporting Flipper logs...</p>);
        return;
      }
      case 'files': {
        let sheepCount = 0;
        const setFileExportMessage = () => {
          setStatusMessage(
            <>
              <p>Exporting Flipper debug files from all devices...</p>
              <p>It could take a long time!</p>
              <p>Let's count sheep while we wait: {sheepCount++}.</p>
              <p>We'll skip it automatically if it exceeds 3 minutes.</p>
            </>,
          );
        };

        setFileExportMessage();

        const interval = setInterval(setFileExportMessage, 3000);
        return () => clearInterval(interval);
      }
      case 'state': {
        let dinosaursCount = 0;
        const setStateExportMessage = () => {
          setStatusMessage(
            <>
              <p>Exporting Flipper state...</p>
              <p>It also could take a long time!</p>
              <p>This time we could count dinosaurs: {dinosaursCount++}.</p>
              <p>We'll skip it automatically if it exceeds 2 minutes.</p>
            </>,
          );
        };

        setStateExportMessage();

        const interval = setInterval(setStateExportMessage, 2000);
        return () => clearInterval(interval);
      }
      case 'archive': {
        setStatusMessage(<p>Creating an archive...</p>);
        return;
      }
      case 'upload': {
        setStatusMessage(<p>Uploading the archive...</p>);
        return;
      }
      case 'support': {
        setStatusMessage(<p>Creating a support request...</p>);
        return;
      }
      case 'error': {
        setStatusMessage(
          <>
            <p>Oops! Something went wrong.</p>
            <p>{status[1]}</p>
          </>,
        );
        return;
      }
      case 'done': {
        setStatusMessage(<p>Done!</p>);
        return;
      }
      case 'cancelled': {
        setStatusMessage(<p>Cancelled! Why? 😱🤯👏</p>);
        return;
      }
    }
  }, [status]);

  return (
    <Modal
      visible={!!status}
      centered
      onCancel={() => {
        setStatus(undefined);
      }}
      title="Exporting everything everywhere all at once"
      footer={null}>
      {statusMessage}
    </Modal>
  );
}

function ConnectionTroubleshootButton({
  toplevelSelection,
  setToplevelSelection,
}: ToplevelProps) {
  return (
    <NavbarButton
      icon={ApiOutlined}
      label="Troubleshoot"
      toggled={toplevelSelection === 'connectivity'}
      onClick={() => {
        setToplevelSelection('connectivity');
      }}
    />
  );
}

function NotificationButton({
  toplevelSelection,
  setToplevelSelection,
}: ToplevelProps) {
  const notifications = useStore((state) => state.notifications);
  const activeNotifications = useMemoize(filterNotifications, [
    notifications.activeNotifications,
    notifications.blocklistedPlugins,
    notifications.blocklistedCategories,
  ]);
  return (
    <NavbarButton
      icon={BellOutlined}
      label="Alerts"
      toggled={toplevelSelection === 'notification'}
      count={activeNotifications.length}
      onClick={() => setToplevelSelection('notification')}
    />
  );
}

function LeftSidebarToggleButton() {
  const dispatch = useDispatch();
  const mainMenuVisible = useStore(
    (state) => state.application.leftSidebarVisible,
  );

  return (
    <NavbarButton
      label="Toggle Sidebar"
      icon={LayoutOutlined}
      toggled={!mainMenuVisible}
      onClick={() => {
        dispatch(toggleLeftSidebarVisible());
      }}
    />
  );
}

function RightSidebarToggleButton() {
  const dispatch = useDispatch();
  const rightSidebarAvailable = useStore(
    (state) => state.application.rightSidebarAvailable,
  );
  const rightSidebarVisible = useStore(
    (state) => state.application.rightSidebarVisible,
  );

  return (
    <NavbarButton
      icon={LayoutOutlined}
      flipIcon
      label="Toggle R.Sidebar"
      toggled={!rightSidebarVisible}
      disabled={!rightSidebarAvailable}
      onClick={() => {
        dispatch(toggleRightSidebarVisible());
      }}
    />
  );
}

function LaunchEmulatorButton() {
  const store = useStore();

  return (
    <NavbarButton
      icon={RocketOutlined}
      label="Start [E/Si]mulator"
      onClick={() => {
        showEmulatorLauncher(store);
      }}
    />
  );
}

function DebugLogsButton({
  toplevelSelection,
  setToplevelSelection,
}: ToplevelProps) {
  const errorCount = useValue(errorCounterAtom);
  return (
    <NavbarButton
      icon={FileExclamationOutlined}
      label="Flipper Logs"
      toggled={toplevelSelection === 'flipperlogs'}
      count={errorCount}
      onClick={() => {
        setToplevelSelection('flipperlogs');
      }}
    />
  );
}

function SetupDoctorButton() {
  const [visible, setVisible] = useState(false);
  const result = useStore(
    (state) => state.healthchecks.healthcheckReport.result,
  );
  const hasNewProblem = useMemo(() => checkHasNewProblem(result), [result]);
  const onClose = useCallback(() => setVisible(false), []);
  return (
    <>
      <NavbarButton
        icon={MedicineBoxOutlined}
        label="Setup Doctor"
        count={hasNewProblem ? true : undefined}
        onClick={() => setVisible(true)}
      />
      <SetupDoctorScreen visible={visible} onClose={onClose} />
    </>
  );
}

const badgeDotClassname = css`
  sup {
    right: calc(50% - 14px);
    margin-top: 8px;
  }
`;
const badgeCountClassname = css`
  sup {
    right: calc(50% - 22px);
    margin-top: 8px;
  }
`;
function NavbarButton({
  icon: Icon,
  label,
  toggled = false,
  onClick,
  count,
  disabled = false,
  flipIcon = false,
}: {
  icon: (props: any) => any;
  label: string;
  // TODO remove optional
  onClick?: () => void;
  toggled?: boolean;
  count?: number | true;
  disabled?: boolean;
  flipIcon?: boolean;
}) {
  const color = toggled ? theme.primaryColor : theme.textColorActive;
  const button = (
    <Button
      aria-pressed={toggled}
      ghost
      onClick={onClick}
      style={{
        color,
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: 'auto',
        padding: theme.space.tiny,
      }}
      disabled={disabled}>
      <Icon
        style={{
          color,
          fontSize: 24,
          transform: flipIcon ? 'scaleX(-1)' : undefined,
        }}
      />
      <span
        style={{
          margin: 0,
          fontSize: theme.fontSize.small,
          color: theme.textColorSecondary,
        }}>
        {label}
      </span>
    </Button>
  );

  if (count !== undefined) {
    return (
      <Badge
        {...{onClick}}
        dot={count === true}
        count={count}
        // using count instead of "offset" prop as we need to perform css calc()
        // while antd internally calls `parseInt` on passed string
        className={count === true ? badgeDotClassname : badgeCountClassname}>
        {button}
      </Badge>
    );
  } else {
    return button;
  }
}

function LoginConnectivityButton() {
  const loggedIn = useValue(currentUser());
  const user = useStore((state) => state.user);

  const profileUrl = user?.profile_picture?.uri;
  const [showLogout, setShowLogout] = useState(false);
  const onHandleVisibleChange = useCallback(
    (visible) => setShowLogout(visible),
    [],
  );

  const connected = useValue(isConnected());

  if (!connected) {
    return (
      <Tooltip
        placement="left"
        title="No connection to intern, ensure you are VPN/Lighthouse for plugin updates and other features">
        <WarningOutlined
          style={{color: theme.warningColor, fontSize: '20px'}}
        />
      </Tooltip>
    );
  }

  return loggedIn ? (
    <Popover
      content={
        <Button
          block
          style={{backgroundColor: theme.backgroundDefault}}
          onClick={async () => {
            onHandleVisibleChange(false);
            await logoutUser();
          }}>
          Log Out
        </Button>
      }
      trigger="click"
      placement="bottom"
      visible={showLogout}
      overlayStyle={{padding: 0}}
      onVisibleChange={onHandleVisibleChange}>
      <Layout.Container padv={theme.inlinePaddingV}>
        <Avatar size={40} src={profileUrl} />
      </Layout.Container>
    </Popover>
  ) : (
    <>
      <LeftRailButton
        icon={<LoginOutlined />}
        title="Log In"
        onClick={() => showLoginDialog()}
      />
    </>
  );
}

const LeftRailButtonElem = styled(Button)<{kind?: 'small'}>(({kind}) => ({
  width: kind === 'small' ? 32 : 36,
  height: kind === 'small' ? 32 : 36,
  border: 'none',
  boxShadow: 'none',
}));
LeftRailButtonElem.displayName = 'LeftRailButtonElem';

export function LeftRailButton({
  icon,
  small,
  selected,
  toggled,
  count,
  title,
  onClick,
  disabled,
}: {
  icon?: React.ReactElement;
  small?: boolean;
  toggled?: boolean;
  selected?: boolean;
  disabled?: boolean;
  count?: number | true;
  title?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
}) {
  const iconElement =
    icon && cloneElement(icon, {style: {fontSize: small ? 16 : 24}});

  let res = (
    <LeftRailButtonElem
      title={title}
      kind={small ? 'small' : undefined}
      type={selected ? 'primary' : 'ghost'}
      icon={iconElement}
      onClick={onClick}
      disabled={disabled}
      style={{
        color: toggled ? theme.primaryColor : undefined,
        background: toggled ? theme.backgroundWash : undefined,
      }}
    />
  );

  if (count !== undefined) {
    res =
      count === true ? (
        <Badge dot offset={[-8, 8]} {...{onClick}}>
          {res}
        </Badge>
      ) : (
        <Badge count={count} offset={[-6, 5]} {...{onClick}}>
          {res}
        </Badge>
      );
  }

  if (title) {
    res = (
      <Tooltip title={title} placement="right">
        {res}
      </Tooltip>
    );
  }

  return res;
}

const menu = css`
  border: none;
  height: 56px;

  .ant-menu-submenu-title {
    hieght: 56px;
  }
`;
const submenu = css`
  height: 56px;

  .ant-menu-submenu-title {
    height: 56px !important;
    padding: 0;
    margin: 0;
  }
  .ant-menu-submenu-arrow {
    display: none;
  }
`;

function ExtrasMenu() {
  const store = useStore();

  const startFileExportTracked = useTrackedCallback(
    'File export',
    () => startFileExport(store.dispatch),
    [store.dispatch],
  );
  const startLinkExportTracked = useTrackedCallback(
    'Link export',
    () => startLinkExport(store.dispatch),
    [store.dispatch],
  );
  const startImportTracked = useTrackedCallback(
    'File import',
    () => showOpenDialog(store),
    [store],
  );

  const [showSettings, setShowSettings] = useState(false);
  const onSettingsClose = useCallback(() => setShowSettings(false), []);

  const settings = useStore((state) => state.settingsState);
  const {showWelcomeAtStartup} = settings;
  const [welcomeVisible, setWelcomeVisible] = useState(showWelcomeAtStartup);

  return (
    <>
      <NUX
        title="Find import, export, deeplink, feedback, settings, and help (welcome) here"
        placement="right">
        <Menu
          mode="vertical"
          className={menu}
          selectable={false}
          style={{backgroundColor: theme.backgroundDefault}}>
          <Menu.SubMenu
            popupOffset={[-50, 50]}
            key="extras"
            title={<NavbarButton icon={SettingOutlined} label="More" />}
            className={submenu}>
            {canOpenDialog() ? (
              <Menu.Item key="importFlipperFile" onClick={startImportTracked}>
                Import Flipper file
              </Menu.Item>
            ) : null}
            {canFileExport() ? (
              <Menu.Item key="exportFile" onClick={startFileExportTracked}>
                Export Flipper file
              </Menu.Item>
            ) : null}
            {constants.ENABLE_SHAREABLE_LINK ? (
              <Menu.Item
                key="exportShareableLink"
                onClick={startLinkExportTracked}>
                Export shareable link
              </Menu.Item>
            ) : null}
            <Menu.Divider />
            <Menu.SubMenu title="Plugin developers">
              <Menu.Item
                key="styleguide"
                onClick={() => {
                  store.dispatch(setStaticView(StyleGuide));
                }}>
                Flipper Style Guide
              </Menu.Item>
              <Menu.Item
                key="triggerDeeplink"
                onClick={() => openDeeplinkDialog(store)}>
                Trigger deeplink
              </Menu.Item>
            </Menu.SubMenu>
            <Menu.Divider />
            <Menu.Item key="settings" onClick={() => setShowSettings(true)}>
              Settings
            </Menu.Item>
            <Menu.Item key="help" onClick={() => setWelcomeVisible(true)}>
              Help
            </Menu.Item>
          </Menu.SubMenu>
        </Menu>
      </NUX>
      {showSettings && (
        <SettingsSheet
          platform={
            getRenderHostInstance().serverConfig.environmentInfo.os.platform
          }
          onHide={onSettingsClose}
        />
      )}
      <WelcomeScreen
        visible={welcomeVisible}
        onClose={() => setWelcomeVisible(false)}
        showAtStartup={showWelcomeAtStartup}
        onCheck={(value) =>
          store.dispatch({
            type: 'UPDATE_SETTINGS',
            payload: {...settings, showWelcomeAtStartup: value},
          })
        }
      />
    </>
  );
}
