// Copyright 2021 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import {Button, Input, Result, Space, Tour} from "antd";
import {SearchOutlined} from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import i18next from "i18next";
import * as Setting from "./Setting";
import * as TourConfig from "./TourConfig";
import * as FormBackend from "./backend/FormBackend";

class BaseListPage extends React.Component {
  constructor(props) {
    super(props);
    // 获取页面标识符（用于 sessionStorage key）
    this.listPageKey = props.match?.path?.replace(/\//g, "_") || "default";

    // 确定初始分页状态
    let initialPagination = {current: 1, pageSize: 10};

    if (props.location?.state?.fromEdit && props.location.state.pagination) {
      // 从编辑页返回
      initialPagination = {...initialPagination, ...props.location.state.pagination};
    } else {
      // 尝试从 sessionStorage 恢复
      const savedPagination = sessionStorage.getItem(`pagination_${this.listPageKey}`);
      if (savedPagination) {
        try {
          initialPagination = {...initialPagination, ...JSON.parse(savedPagination)};
        } catch (e) {
          // ignore
        }
      }
    }

    this.state = {
      classes: props,
      organizationName: this.props.match?.params.organizationName || Setting.getRequestOrganization(this.props.account),
      data: [],
      pagination: initialPagination,
      loading: false,
      searchText: "",
      searchedColumn: "",
      isAuthorized: true,
      isTourVisible: TourConfig.getTourVisible(),
      formItems: [],
    };

    // 绑定刷新事件处理
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
  }

  // 页面刷新时清除分页缓存
  handleBeforeUnload() {
    // 清除所有分页缓存
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith("pagination_")) {
        sessionStorage.removeItem(key);
      }
    });
  }

  handleOrganizationChange = () => {
    this.setState({
      organizationName: this.props.match?.params.organizationName || Setting.getRequestOrganization(this.props.account),
    },
    () => {
      const {pagination} = this.state;
      this.fetch({pagination});
    });
  };

  handleTourChange = () => {
    this.setState({isTourVisible: TourConfig.getTourVisible()});
  };

  componentDidMount() {
    window.addEventListener("storageOrganizationChanged", this.handleOrganizationChange);
    window.addEventListener("storageTourChanged", this.handleTourChange);
    window.addEventListener("beforeunload", this.handleBeforeUnload);
    if (!Setting.isAdminUser(this.props.account)) {
      Setting.setOrganization("All");
    }
    // 从编辑页返回时，保存分页状态到 sessionStorage，并清除 history state
    if (this.props.location?.state?.fromEdit) {
      sessionStorage.setItem(`pagination_${this.listPageKey}`, JSON.stringify({
        current: this.state.pagination.current,
        pageSize: this.state.pagination.pageSize,
      }));
      this.props.history.replace({
        pathname: this.props.location.pathname,
        search: this.props.location.search,
        state: {},
      });
    }
  }

  componentWillUnmount() {
    if (this.state.intervalId !== null) {
      clearInterval(this.state.intervalId);
    }
    window.removeEventListener("storageTourChanged", this.handleTourChange);
    window.removeEventListener("storageOrganizationChanged", this.handleOrganizationChange);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);

    // 组件卸载时保存分页状态（用于切换 tab 后恢复）
    sessionStorage.setItem(`pagination_${this.listPageKey}`, JSON.stringify({
      current: this.state.pagination.current,
      pageSize: this.state.pagination.pageSize,
    }));
  }

  UNSAFE_componentWillMount() {
    const {pagination} = this.state;
    this.fetch({pagination});
    this.getForm();
  }

  getForm() {
    const tag = this.props.account.tag;
    const formType = this.props.match?.path?.replace(/^\//, "");
    let formName = formType;
    if (tag !== "") {
      formName = formType + "-tag-" + tag;
      FormBackend.getForm(this.props.account.owner, formName)
        .then(res => {
          if (res.status === "ok" && res.data) {
            this.setState({formItems: res.data.formItems});
          } else {
            this.fetchFormWithoutTag(formType);
          }
        });
    } else {
      this.fetchFormWithoutTag(formType);
    }
  }

  fetchFormWithoutTag(formName) {
    FormBackend.getForm(this.props.account.owner, formName)
      .then(res => {
        if (res.status === "ok" && res.data) {
          this.setState({formItems: res.data.formItems});
        } else {
          this.setState({formItems: []});
        }
      });
  }

  getColumnSearchProps = (dataIndex, customRender = null) => ({
    filterDropdown: ({setSelectedKeys, selectedKeys, confirm, clearFilters}) => (
      <div style={{padding: 8}}>
        <Input
          ref={node => {
            this.searchInput = node;
          }}
          placeholder={i18next.t("general:Please input your search")}
          value={selectedKeys[0]}
          onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => this.handleSearch(selectedKeys, confirm, dataIndex)}
          style={{marginBottom: 8, display: "block"}}
        />

        <Space>
          <Button
            type="primary"
            onClick={() => this.handleSearch(selectedKeys, confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{width: 90}}
          >
            {i18next.t("general:Search")}
          </Button>
          <Button onClick={() => this.handleReset(clearFilters)} size="small" style={{width: 90}}>
            {i18next.t("general:Reset")}
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              confirm({closeDropdown: false});
              this.setState({
                searchText: selectedKeys[0],
                searchedColumn: dataIndex,
              });
            }}
          >
            {i18next.t("general:Filter")}
          </Button>
        </Space>
      </div>
    ),
    filterIcon: filtered => <SearchOutlined style={{color: filtered ? "#1890ff" : undefined}} />,
    onFilter: (value, record) =>
      record[dataIndex]
        ? record[dataIndex].toString().toLowerCase().includes(value.toLowerCase())
        : "",
    filterDropdownProps: {
      onOpenChange: visible => {
        if (visible) {
          setTimeout(() => this.searchInput.select(), 100);
        }
      },
    },
    render: (text, record, index) => {
      const highlightContent = this.state.searchedColumn === dataIndex ? (
        <Highlighter
          highlightStyle={{backgroundColor: "#ffc069", padding: 0}}
          searchWords={[this.state.searchText]}
          autoEscape
          textToHighlight={text ? text.toString() : ""}
        />
      ) : (
        text
      );

      return customRender ? customRender({text, record, index}, highlightContent) : highlightContent;
    },
  });

  handleSearch = (selectedKeys, confirm, dataIndex) => {
    this.fetch({searchText: selectedKeys[0], searchedColumn: dataIndex, pagination: this.state.pagination});
  };

  handleReset = clearFilters => {
    clearFilters();
    const {pagination} = this.state;
    this.fetch({pagination});
  };

  handleTableChange = (pagination, filters, sorter) => {
    // 保存分页状态到 sessionStorage
    sessionStorage.setItem(`pagination_${this.listPageKey}`, JSON.stringify({
      current: pagination.current,
      pageSize: pagination.pageSize,
    }));

    this.fetch({
      sortField: sorter.field,
      sortOrder: sorter.order,
      pagination,
      ...filters,
      searchText: this.state.searchText,
      searchedColumn: this.state.searchedColumn,
    });
  };

  setIsTourVisible = () => {
    TourConfig.setIsTourVisible(false);
    this.setState({isTourVisible: false});
  };

  getSteps = () => {
    const nextPathName = TourConfig.getNextUrl();
    const steps = TourConfig.getSteps();
    steps.map((item, index) => {
      if (!index) {
        item.target = () => document.querySelector(".ant-table");
      } else {
        item.target = () => document.getElementById(item.id) || null;
      }
      if (index === steps.length - 1) {
        item.nextButtonProps = {
          children: TourConfig.getNextButtonChild(nextPathName),
        };
      }
    });
    return steps;
  };

  handleTourComplete = () => {
    const nextPathName = TourConfig.getNextUrl();
    if (nextPathName !== "") {
      this.props.history.push("/" + nextPathName);
      TourConfig.setIsTourVisible(true);
    }
  };

  render() {
    if (!this.state.isAuthorized) {
      return (
        <Result
          status="403"
          title="403 Unauthorized"
          subTitle={i18next.t("general:Sorry, you do not have permission to access this page or logged in status invalid.")}
          extra={<a href="/"><Button type="primary">{i18next.t("general:Back Home")}</Button></a>}
        />
      );
    }

    return (
      <div>
        {
          this.renderTable(this.state.data)
        }
        <Tour
          open={Setting.isMobile() ? false : this.state.isTourVisible}
          onClose={this.setIsTourVisible}
          steps={this.getSteps()}
          indicatorsRender={(current, total) => (
            <span>
              {current + 1} / {total}
            </span>
          )}
          onFinish={this.handleTourComplete}
        />
      </div>
    );
  }
}

export default BaseListPage;
